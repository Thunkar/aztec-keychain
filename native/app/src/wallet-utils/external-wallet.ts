import {
  type Account,
  AccountManager,
  BaseWallet,
  SignerlessAccount,
  type SimulateOptions,
  getContractInstanceFromInstantiationParams,
  type AztecNode,
  type Aliased,
  type ChainInfo,
  Contract,
  type SendOptions,
  type UserFeeOptions,
  type FeeOptions,
} from "@aztec/aztec.js";
import { type ContractArtifact } from "@aztec/stdlib/abi";
import type {
  ContractInstanceWithAddress,
  ContractInstantiationData,
} from "@aztec/stdlib/contract";
import {
  ExecutionPayload,
  mergeExecutionPayloads,
} from "@aztec/entrypoints/payload";
import { Fq, Fr } from "@aztec/foundation/fields";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import {
  StubAccountContractArtifact,
  createStubAccount,
} from "@aztec/accounts/stub";
import {
  collectOffchainEffects,
  type TxProvingResult,
  type TxSimulationResult,
} from "@aztec/stdlib/tx";
import {
  EcdsaKAccountContract,
  EcdsaRAccountContract,
} from "@aztec/accounts/ecdsa";
import { SchnorrAccountContract } from "@aztec/accounts/schnorr";
import { type PXE } from "@aztec/pxe/server";
import { WalletDB, type AccountType } from "./wallet_db";
import {
  AccountFeePaymentMethodOptions,
  type DefaultAccountEntrypointOptions,
} from "@aztec/entrypoints/account";
import {
  WalletInteraction,
  WalletUpdateEvent,
  type WalletInteractionType,
} from "./wallet-interaction";
import {
  promiseWithResolvers,
  type PromiseWithResolvers,
} from "@aztec/foundation/promise";
import {
  AuthorizationRequestEvent,
  type AuthorizationRequest,
  type AuthorizationResponse,
} from "./authorization";
import { GasSettings } from "@aztec/stdlib/gas";
import { prepareForFeePayment } from "./sponsoredFPC";
import { CallAuthorizationFormatter } from "./decoding/call-authorization-formatter";
import { TxCallStackDecoder } from "./decoding/tx-callstack-decoder";

// TODO: remove this once aztec.js exports it
export type ContractInstanceAndArtifact = Pick<
  Contract,
  "artifact" | "instance"
>;

export class ExternalWallet extends BaseWallet implements EventTarget {
  private eventEmitter = new EventTarget();

  constructor(
    pxe: PXE,
    node: AztecNode,
    protected db: WalletDB,
    protected pendingAuthorizations: Map<
      string,
      {
        promise: PromiseWithResolvers<AuthorizationResponse>;
        request: AuthorizationRequest;
      }
    >,
    protected appId: string,
    protected chainInfo: ChainInfo
  ) {
    super(pxe, node);
  }

  override async getDefaultFeeOptions(
    from: AztecAddress,
    userFeeOptions: UserFeeOptions | undefined
  ): Promise<FeeOptions> {
    const maxFeesPerGas =
      userFeeOptions?.gasSettings?.maxFeesPerGas ??
      (await this.aztecNode.getCurrentBaseFees()).mul(1 + this.baseFeePadding);
    let walletFeePaymentMethod;
    let accountFeePaymentMethodOptions;
    // The transaction does not include a fee payment method, so we set a default
    if (!userFeeOptions?.embeddedPaymentMethodFeePayer) {
      walletFeePaymentMethod = await prepareForFeePayment(this);
      accountFeePaymentMethodOptions = AccountFeePaymentMethodOptions.EXTERNAL;
    } else {
      // The transaction includes fee payment method, so we check if we are the fee payer for it
      // (this can only happen if the embedded payment method is FeeJuiceWithClaim)
      accountFeePaymentMethodOptions = from.equals(
        userFeeOptions.embeddedPaymentMethodFeePayer
      )
        ? AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM
        : AccountFeePaymentMethodOptions.EXTERNAL;
    }
    const gasSettings: GasSettings = GasSettings.default({
      ...userFeeOptions?.gasSettings,
      maxFeesPerGas,
    });
    this.log.debug(`Using L2 gas settings`, gasSettings);
    return {
      gasSettings,
      walletFeePaymentMethod,
      accountFeePaymentMethodOptions,
    };
  }

  override getChainInfo(): Promise<ChainInfo> {
    return Promise.resolve(this.chainInfo);
  }

  dispatchEvent(event: Event): boolean {
    return this.eventEmitter.dispatchEvent(event);
  }

  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    return this.eventEmitter.addEventListener(type, callback, options);
  }

  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void {
    return this.eventEmitter.removeEventListener(type, callback, options);
  }

  async storeAndEmitInteraction(
    interaction: WalletInteraction<WalletInteractionType>
  ) {
    await this.db.createOrUpdateInteraction(interaction);
    this.dispatchEvent(new WalletUpdateEvent(interaction));
    return interaction;
  }

  protected async requestAuthorization(
    method: string,
    params: any,
    persistent = false
  ): Promise<AuthorizationResponse> {
    // Check for existing persistent authorization
    if (persistent) {
      const existingAuth = await this.db.retrievePersistentAuthorization(
        this.appId,
        method
      );
      if (existingAuth) {
        // Return stored authorization without prompting user
        return {
          id: crypto.randomUUID(),
          approved: true,
          appId: this.appId,
          data: existingAuth,
        };
      }
    }

    const authRequest: AuthorizationRequest = {
      id: crypto.randomUUID(),
      appId: this.appId,
      method,
      params,
      timestamp: Date.now(),
    };

    const responseHandle = promiseWithResolvers<AuthorizationResponse>();
    this.pendingAuthorizations.set(authRequest.id, {
      promise: responseHandle,
      request: authRequest,
    });

    const event = new AuthorizationRequestEvent(authRequest);
    this.dispatchEvent(event);

    const response = await responseHandle.promise;
    if (!response.approved) {
      throw new Error(`User denied ${method} request`);
    }

    if (persistent && response.data) {
      // Store the authorization for future use
      await this.db.storePersistentAuthorization(
        this.appId,
        method,
        response.data
      );
    }

    return response;
  }

  resolveAuthorization(response: AuthorizationResponse) {
    const pending = this.pendingAuthorizations.get(response.id);
    if (pending) {
      pending.promise.resolve(response);
      this.pendingAuthorizations.delete(response.id);
    }
  }

  protected async getAccountFromAddress(
    address: AztecAddress
  ): Promise<Account> {
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      const chainInfo = await this.getChainInfo();
      account = new SignerlessAccount(chainInfo);
    } else {
      const { secretKey, salt, signingKey, type } =
        await this.db.retrieveAccount(address);
      const accountManager = await this.createAccountInternal(
        type,
        secretKey,
        salt,
        signingKey
      );
      account = await accountManager.getAccount();
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }

    return account;
  }

  protected async createAccountInternal(
    type: AccountType,
    secret: Fr,
    salt: Fr,
    signingKey: Buffer
  ): Promise<AccountManager> {
    let contract;
    switch (type) {
      case "schnorr": {
        contract = new SchnorrAccountContract(Fq.fromBuffer(signingKey));
        break;
      }
      case "ecdsasecp256k1": {
        contract = new EcdsaKAccountContract(signingKey);
        break;
      }
      case "ecdsasecp256r1": {
        contract = new EcdsaRAccountContract(signingKey);
        break;
      }
      default: {
        throw new Error(`Unknown account type ${type}`);
      }
    }

    const accountManager = await AccountManager.create(
      this,
      secret,
      contract,
      salt
    );

    const instance = await accountManager.getInstance();
    const artifact = await accountManager
      .getAccountContract()
      .getContractArtifact();

    await this.registerContract(
      instance,
      artifact,
      accountManager.getSecretKey()
    );

    return accountManager;
  }

  // External API methods - all require authorization

  override async getAccounts(): Promise<Aliased<AztecAddress>[]> {
    const response = await this.requestAuthorization("getAccounts", {}, true);
    // Return the authorized accounts with their (potentially overridden) aliases
    if (!response.data || !response.data.accounts) {
      throw new Error("Authorization response missing account data");
    }

    const { accounts } = response.data;
    return accounts.map((acc: any) => ({
      alias: acc.alias,
      item: AztecAddress.fromString(acc.item),
    }));
  }

  override async registerContract(
    instanceData:
      | AztecAddress
      | ContractInstanceWithAddress
      | ContractInstantiationData
      | ContractInstanceAndArtifact,
    artifact?: ContractArtifact,
    secretKey?: Fr
  ): Promise<ContractInstanceWithAddress> {
    // Determine the contract address to check
    let addressToCheck: AztecAddress;
    if (instanceData instanceof AztecAddress) {
      addressToCheck = instanceData;
    } else if ("address" in instanceData) {
      addressToCheck = instanceData.address;
    } else if ("instance" in instanceData) {
      addressToCheck = instanceData.instance.address;
    } else {
      // ContractInstantiationData - compute the address
      const instance = await getContractInstanceFromInstantiationParams(
        artifact!,
        instanceData
      );
      addressToCheck = instance.address;
    }

    // Check if contract already exists in PXE
    const metadata = await this.getContractMetadata(addressToCheck);
    if (metadata.contractInstance) {
      // Contract already registered, no need to prompt
      return metadata.contractInstance;
    }

    // Request authorization with persistent storage
    await this.requestAuthorization("registerContract", {
      address: addressToCheck.toString(),
    });

    // Register the contract with PXE
    return await super.registerContract(instanceData, artifact, secretKey);
  }

  override async registerSender(
    address: AztecAddress,
    alias: string
  ): Promise<AztecAddress> {
    await this.requestAuthorization("registerSender", {
      address: address.toString(),
      alias,
    });

    await this.db.storeSender(address, alias);
    return this.pxe.registerSender(address);
  }

  override async getSenders(): Promise<Aliased<AztecAddress>[]> {
    await this.requestAuthorization("getSenders", {});

    const senders = await this.pxe.getSenders();
    const storedSenders = await this.db.listSenders();
    for (const storedSender of storedSenders) {
      if (
        senders.findIndex((sender) => sender.equals(storedSender.item)) === -1
      ) {
        await this.pxe.registerSender(storedSender.item);
      }
    }
    return storedSenders;
  }

  async getFakeAccountDataFor(address: AztecAddress) {
    const chainInfo = await this.getChainInfo();
    const originalAccount = await this.getAccountFromAddress(address);
    const originalAddress = originalAccount.getCompleteAddress();
    const { contractInstance } = await this.pxe.getContractMetadata(
      originalAddress.address
    );
    if (!contractInstance) {
      throw new Error(
        `No contract instance found for address: ${originalAddress.address}`
      );
    }
    const stubAccount = createStubAccount(originalAddress, chainInfo);
    const instance = await getContractInstanceFromInstantiationParams(
      StubAccountContractArtifact,
      {
        salt: Fr.random(),
      }
    );
    return {
      account: stubAccount,
      instance,
      artifact: StubAccountContractArtifact,
    };
  }

  override async proveTx(
    exec: ExecutionPayload,
    opts: SendOptions
  ): Promise<TxProvingResult> {
    const interaction = WalletInteraction.from({
      type: "proveTx",
      status: "SIMULATING",
      complete: false,
      title: `Proving transaction`,
    });
    await this.storeAndEmitInteraction(interaction);
    const fee = await this.getDefaultFeeOptions(opts.from, opts.fee);

    const simulationResult = await this.simulateTx(exec, opts);

    await this.storeAndEmitInteraction(
      interaction.update({ status: "COMPUTING REQUIRED AUTHORIZATIONS" })
    );

    const offChainEffects = collectOffchainEffects(
      simulationResult.privateExecutionResult
    );

    // Parse call authorizations from offchain effects
    const formatter = new CallAuthorizationFormatter(this.pxe, this.db);
    const callAuthorizations = await Promise.all(
      offChainEffects.map((effect) =>
        formatter.parseCallAuthorizationFromEffect(effect)
      )
    );

    const filteredCallAuthorizations = callAuthorizations.filter(Boolean);

    // Format for display
    const readableCallAuthorizations =
      await formatter.formatCallAuthorizationsForDisplay(
        filteredCallAuthorizations
      );

    // Decode execution call stack
    const callStackDecoder = new TxCallStackDecoder(this.pxe, this.db);
    const executionTrace =
      await callStackDecoder.decodeSimulationResult(simulationResult);

    const authWitnesses = await Promise.all(
      filteredCallAuthorizations.map((auth) =>
        this.createAuthWit(opts.from, {
          caller: auth.caller,
          call: auth.functionCall,
        })
      )
    );

    await this.storeAndEmitInteraction(
      interaction.update({ status: "REQUESTING AUTHORIZATION" })
    );

    await this.requestAuthorization(
      "proveTx",
      {
        callAuthorizations: readableCallAuthorizations,
        executionTrace,
      },
      false
    );

    exec.authWitnesses.push(...authWitnesses);

    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(
      exec,
      opts.from,
      fee
    );
    await this.storeAndEmitInteraction(
      interaction.update({ status: "PROVING" })
    );

    const provenTx = await this.pxe.proveTx(txRequest);

    await this.storeAndEmitInteraction(
      interaction.update({ status: "PROVEN", complete: true })
    );
    return provenTx;
  }

  override async simulateTx(
    executionPayload: ExecutionPayload,
    opts: SimulateOptions
  ): Promise<TxSimulationResult> {
    //await this.requestAuthorization("simulateTx", [executionPayload, opts]);

    const interaction = WalletInteraction.from({
      type: "simulateTx",
      title: "Simulating interaction",
      complete: false,
      status: "SIMULATING",
    });
    await this.storeAndEmitInteraction(interaction);
    const feeOptions = opts.fee?.estimateGas
      ? await this.getFeeOptionsForGasEstimation(opts.from, opts.fee)
      : await this.getDefaultFeeOptions(opts.from, opts.fee);
    const feeExecutionPayload =
      await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const executionOptions: DefaultAccountEntrypointOptions = {
      txNonce: Fr.random(),
      cancellable: this.cancellableTransactions,
      feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions,
    };
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
      : executionPayload;

    const {
      account: fromAccount,
      instance,
      artifact,
    } = await this.getFakeAccountDataFor(opts.from);
    const txRequest = await fromAccount.createTxExecutionRequest(
      finalExecutionPayload,
      feeOptions.gasSettings,
      executionOptions
    );
    const contractOverrides = {
      [opts.from.toString()]: { instance, artifact },
    };
    const result = this.pxe.simulateTx(
      txRequest,
      true /* simulatePublic */,
      true,
      true,
      {
        contracts: contractOverrides,
      }
    );
    this.storeAndEmitInteraction(
      interaction.update({ complete: true, status: "SIMULATED" })
    );
    return result;
  }
}
