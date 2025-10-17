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
  type AuthorizationItem,
  type GetAccountsAuthData,
  type AuthorizationData,
} from "./authorization";
import { GasSettings } from "@aztec/stdlib/gas";
import { prepareForFeePayment } from "./sponsoredFPC";
import { TxDecodingService } from "./decoding/tx-decoding-service";
import type { ReadableCallAuthorization } from "./decoding/call-authorization-formatter";
import type { DecodedExecutionTrace } from "./decoding/tx-callstack-decoder";

// TODO: remove this once aztec.js exports it
export type ContractInstanceAndArtifact = Pick<
  Contract,
  "artifact" | "instance"
>;

type ReadableTxInformation = {
  callAuthorizations: ReadableCallAuthorization[];
  executionTrace: DecodedExecutionTrace;
};

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

  protected async requestSingleAuthorization(
    method: string,
    params: any,
    persistent = false
  ): Promise<AuthorizationData> {
    // Check for existing persistent authorization
    if (persistent) {
      const existingAuth = await this.db.retrievePersistentAuthorization(
        this.appId,
        method
      );
      if (existingAuth) {
        // Return stored authorization data directly
        return existingAuth;
      }
    }

    // Create a single item batch request
    const itemId = crypto.randomUUID();
    const authRequest: AuthorizationRequest = {
      id: crypto.randomUUID(),
      appId: this.appId,
      items: [
        {
          id: itemId,
          appId: this.appId,
          method,
          params,
          timestamp: Date.now(),
        },
      ],
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

    // Extract the single item response
    const itemResponse = response.itemResponses?.[itemId];

    if (!itemResponse || !itemResponse.approved) {
      throw new Error(`User denied ${method} request`);
    }

    if (persistent && itemResponse.data) {
      // Store the authorization for future use
      await this.db.storePersistentAuthorization(
        this.appId,
        method,
        itemResponse.data
      );
    }

    return itemResponse.data;
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

  /**
   * Helper method to resolve contract address from various instanceData formats.
   */
  private async resolveContractAddress(
    instanceData:
      | AztecAddress
      | ContractInstanceWithAddress
      | ContractInstantiationData
      | ContractInstanceAndArtifact,
    artifact?: ContractArtifact
  ): Promise<AztecAddress> {
    if (instanceData instanceof AztecAddress) {
      return instanceData;
    } else if ("address" in instanceData) {
      return instanceData.address;
    } else if ("instance" in instanceData) {
      return instanceData.instance.address;
    } else {
      // ContractInstantiationData - compute the address
      const instance = await getContractInstanceFromInstantiationParams(
        artifact!,
        instanceData
      );
      return instance.address;
    }
  }

  // External API methods - all require authorization

  override async getAccounts(): Promise<Aliased<AztecAddress>[]> {
    const data = await this.requestSingleAuthorization("getAccounts", {}, true);
    // Return the authorized accounts with their (potentially overridden) aliases
    const authData = data as GetAccountsAuthData;
    if (!authData || !authData.accounts) {
      throw new Error("Authorization response missing account data");
    }

    const { accounts } = authData;
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
    secretKey?: Fr,
    skipAuth?: boolean
  ): Promise<ContractInstanceWithAddress> {
    // Determine the contract address to check
    const addressToCheck = await this.resolveContractAddress(
      instanceData,
      artifact
    );

    // Check if contract already exists in PXE
    const metadata = await this.getContractMetadata(addressToCheck);
    if (metadata.contractInstance) {
      // Contract already registered, no need to prompt
      return metadata.contractInstance;
    }

    // Request authorization with persistent storage (unless skipped for batch)
    if (!skipAuth) {
      await this.requestSingleAuthorization("registerContract", {
        address: addressToCheck.toString(),
      });
    }

    // Register the contract with PXE
    return await super.registerContract(instanceData, artifact, secretKey);
  }

  override async registerSender(
    address: AztecAddress,
    alias: string,
    skipAuth?: boolean
  ): Promise<AztecAddress> {
    // Request authorization (unless skipped for batch)
    if (!skipAuth) {
      await this.requestSingleAuthorization("registerSender", {
        address: address.toString(),
        alias,
      });
    }

    await this.db.storeSender(address, alias);
    return this.pxe.registerSender(address);
  }

  override async getSenders(): Promise<Aliased<AztecAddress>[]> {
    await this.requestSingleAuthorization("getSenders", {});

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
    opts: SendOptions,
    txInformation?: ReadableTxInformation
  ): Promise<TxProvingResult> {
    const interaction = WalletInteraction.from({
      type: "proveTx",
      status: "CREATING",
      complete: false,
      title: `Proving transaction`,
    });
    await this.storeAndEmitInteraction(interaction);

    try {
      const fee = await this.getDefaultFeeOptions(opts.from, opts.fee);

      let callAuthorizations: ReadableCallAuthorization[];
      if (!txInformation) {
        let executionTrace: DecodedExecutionTrace;

        await this.storeAndEmitInteraction(
          interaction.update({ status: "COMPUTING AUTHORIZATIONS" })
        );

        ({ callAuthorizations, executionTrace } =
          await this.extractTxInformation(exec, opts, interaction));

        await this.storeAndEmitInteraction(
          interaction.update({ status: "REQUESTING AUTHORIZATION" })
        );

        await this.requestSingleAuthorization(
          "proveTx",
          {
            callAuthorizations,
            executionTrace,
          },
          false
        );
      } else {
        callAuthorizations = txInformation.callAuthorizations;
      }

      const authWitnesses = await Promise.all(
        callAuthorizations.map((auth) =>
          this.createAuthWit(opts.from, {
            caller: auth.rawData.caller,
            call: auth.rawData.functionCall,
          })
        )
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
    } catch (error) {
      // Update interaction to reflect error before rethrowing
      await this.storeAndEmitInteraction(
        interaction.update({
          complete: true,
          status: "PROVING FAILED",
          description: error instanceof Error ? error.message : String(error),
        })
      );
      throw error;
    }
  }

  private async extractTxInformation(
    exec: ExecutionPayload,
    opts: SendOptions,
    existingInteraction?: WalletInteraction<WalletInteractionType>
  ) {
    const simulationResult = await this.simulateTx(
      exec,
      opts,
      existingInteraction
    );

    // Use TxDecodingService to decode transaction information with caching
    const decodingService = new TxDecodingService(this.pxe, this.db);
    const decoded = await decodingService.decodeTransaction(simulationResult);

    // Persist simulation result for later retrieval if we have an interaction
    if (existingInteraction) {
      await this.db.storeSimulationResult(
        existingInteraction.id,
        simulationResult
      );
    }

    return decoded;
  }

  // TODO: Fix types once @aztec/aztec.js exports BatchedMethod, BatchableMethods, and BatchResults from the main package
  override async batch(methods: any): Promise<any> {
    // 1. Convert methods to AuthorizationItems, checking persistent cache
    const items: AuthorizationItem[] = [];
    const cachedResults: (any | null)[] = [];
    const itemMethodMap = new Map<string, string>();

    for (const methodCall of methods) {
      const { name, args } = methodCall;

      // Check persistent cache
      const persistentAuth = await this.db.retrievePersistentAuthorization(
        this.appId,
        name
      );

      if (persistentAuth) {
        cachedResults.push(persistentAuth);
        continue;
      }

      // Create AuthorizationItem for this item
      let params: any = args;

      // Pre-process proveTx to include display data
      if (name === "proveTx") {
        try {
          const [exec, opts] = args as Parameters<typeof this.proveTx>;
          const displayData = await this.extractTxInformation(exec, opts);
          args.push(displayData);
          params = {
            originalArgs: args,
            callAuthorizations: displayData.callAuthorizations,
            executionTrace: displayData.executionTrace,
          };
        } catch (error) {
          // If simulation/extraction fails, don't add to batch
          // Push error as cached result so it gets thrown later
          cachedResults.push(Promise.reject(error));
          continue;
        }
      } else if (name === "registerContract") {
        // Check if contract already exists in PXE
        const [instanceData, artifact] = args;
        const address = await this.resolveContractAddress(
          instanceData,
          artifact
        );
        const metadata = await this.getContractMetadata(address);

        if (metadata.contractInstance) {
          // Contract already registered, skip authorization
          cachedResults.push(metadata.contractInstance);
          continue;
        }

        // Contract not registered, need authorization
        // Add skipAuth flag to args so it bypasses auth in the execution phase
        args.push(true);
        params = {
          originalArgs: args,
          contractAddress: address,
        };
      } else if (name === "registerSender") {
        // Add skipAuth flag to args
        const [address, alias] = args;
        args.push(true);
        params = {
          originalArgs: args,
          address,
          alias,
        };
      }

      const itemId = Fr.random().toString();
      items.push({
        id: itemId,
        appId: this.appId,
        method: name,
        params: params,
        timestamp: Date.now(),
      });
      itemMethodMap.set(itemId, name);

      cachedResults.push(null);
    }

    // 2. If all cached, execute without authorization
    if (items.length === 0) {
      return super.batch(methods);
    }

    // 3. Request batch authorization using unified flow
    const authRequest: AuthorizationRequest = {
      id: Fr.random().toString(),
      appId: this.appId,
      items: items,
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
      throw new Error("User denied batch request");
    }

    // 4. Store persistent authorizations
    await this.db.storeBatchPersistentAuthorizations(
      this.appId,
      response.itemResponses,
      itemMethodMap
    );

    // 5. Execute approved items using dynamic dispatch (like BaseWallet)
    const results: any[] = [];
    let itemIndex = 0;

    for (let i = 0; i < methods.length; i++) {
      if (cachedResults[i] !== null) {
        // Use cached result (from persistent auth, PXE check, or error)
        // If it's a rejected promise (from simulation failure), await it to throw
        const result = cachedResults[i];
        if (result && typeof result.then === "function") {
          results.push(await result);
        } else {
          results.push(result);
        }
      } else {
        const item = items[itemIndex];
        const itemResponse = response.itemResponses[item.id];

        if (!itemResponse || !itemResponse.approved) {
          throw new Error(`Authorization denied for ${item.method}`);
        }

        const { name, args } = methods[i];

        // Use dynamic dispatch to call the method, just like BaseWallet.batch()
        // The skipAuth flag (added during preprocessing) bypasses authorization
        const fn = (this as any)[name] as (...args: any[]) => Promise<any>;
        const result = await fn.apply(this, args);
        results.push(result);

        itemIndex++;
      }
    }

    return results as any;
  }

  override async simulateTx(
    executionPayload: ExecutionPayload,
    opts: SimulateOptions,
    existingInteraction?: WalletInteraction<WalletInteractionType>
  ): Promise<TxSimulationResult> {
    //await this.requestSingleAuthorization("simulateTx", [executionPayload, opts]);

    const interaction =
      existingInteraction ??
      WalletInteraction.from({
        type: "simulateTx",
        title: `Simulating transaction`,
        description: `App: ${this.appId}`,
        complete: false,
        status: "SIMULATING",
      });
    await this.storeAndEmitInteraction(interaction);

    try {
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
      const result = await this.pxe.simulateTx(
        txRequest,
        true /* simulatePublic */,
        true,
        true,
        {
          contracts: contractOverrides,
        }
      );

      // For standalone simulations (no existingInteraction), store the raw simulation result
      if (!existingInteraction) {
        try {
          await this.db.storeSimulationResult(interaction.id, result);
        } catch (storageError) {
          // If storage fails, just log it - don't fail the simulation
          this.log.error(`Failed to store simulation result: ${storageError}`);
        }

        await this.storeAndEmitInteraction(
          interaction.update({ complete: true, status: "SIMULATED" })
        );
      }
      return result;
    } catch (error) {
      // Update interaction to reflect error before rethrowing
      await this.storeAndEmitInteraction(
        interaction.update({
          complete: true,
          status: "SIMULATION FAILED",
          description: error instanceof Error ? error.message : String(error),
        })
      );
      throw error;
    }
  }
}
