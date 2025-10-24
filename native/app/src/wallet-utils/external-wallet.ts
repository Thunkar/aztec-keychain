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
  type BatchedMethod,
  type BatchableMethods,
  type BatchResults,
  type ContractInstanceAndArtifact,
  type Logger,
} from "@aztec/aztec.js";
import type { AuthWitness } from "@aztec/stdlib/auth-witness";
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
  type TxExecutionRequest,
  type UtilitySimulationResult,
  TxHash,
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
  type AuthorizationPersistence,
} from "./authorization";
import { TxDecodingService } from "./decoding/tx-decoding-service";
import type { ReadableCallAuthorization } from "./decoding/call-authorization-formatter";
import {
  TxCallStackDecoder,
  type DecodedExecutionTrace,
} from "./decoding/tx-callstack-decoder";

import { inspect } from "node:util";
import {
  hashExecutionPayload,
  hashUtilityCall,
  generateSimulationTitle,
} from "./simulation-utils";
import { BaseNativeWallet } from "./base-native-wallet";

type ReadableTxInformation = {
  callAuthorizations: ReadableCallAuthorization[];
  executionTrace: DecodedExecutionTrace;
};

export class ExternalWallet extends BaseNativeWallet {
  constructor(
    pxe: PXE,
    node: AztecNode,
    db: WalletDB,
    pendingAuthorizations: Map<
      string,
      {
        promise: PromiseWithResolvers<AuthorizationResponse>;
        request: AuthorizationRequest;
      }
    >,
    appId: string,
    chainInfo: ChainInfo,
    log: Logger
  ) {
    super(pxe, node, db, pendingAuthorizations, appId, chainInfo, log);
  }

  /**
   * Unified authorization method with flexible persistence options.
   *
   * @param method - The method being authorized
   * @param params - Parameters to display in authorization UI
   * @param persistence - Persistence configuration
   * @returns Authorization data from user response or stored data
   */
  protected async requestAuthorization(
    method: string,
    params: any,
    persistence: AuthorizationPersistence = { persist: false }
  ): Promise<AuthorizationData> {
    // Determine the storage key (use custom or default to method)
    const storageKey =
      persistence.persist && persistence.storageKey
        ? persistence.storageKey
        : method;

    // Check for existing persistent authorization
    if (persistence.persist) {
      const existingAuth = await this.db.retrievePersistentAuthorization(
        this.appId,
        storageKey
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

    // Store persistent authorization if configured
    if (persistence.persist) {
      // Use custom persistData if provided, otherwise use response data
      const dataToStore = persistence.persistData ?? itemResponse.data;
      if (dataToStore) {
        await this.db.storePersistentAuthorization(
          this.appId,
          storageKey,
          dataToStore
        );
      }
    }

    return itemResponse.data;
  }

  protected async getAccountFromAddress(
    address: AztecAddress
  ): Promise<Account> {
    // Check if there's a persistent getAccounts authorization
    const authData = await this.db.retrievePersistentAuthorization(
      this.appId,
      "getAccounts"
    );

    if (!authData || !authData.accounts) {
      throw new Error(
        `App ${this.appId} does not have authorization to access any accounts. Please request getAccounts authorization first.`
      );
    }

    // Check if the specific account is in the authorized list
    const authorizedAddresses = authData.accounts.map((acc: any) =>
      acc.item.toString()
    );
    const requestedAddress = address.toString();

    if (!authorizedAddresses.includes(requestedAddress)) {
      throw new Error(
        `App ${this.appId} does not have authorization to use account ${requestedAddress}. Authorized accounts: ${authorizedAddresses.join(", ")}`
      );
    }
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      const chainInfo = await this.getChainInfo();
      account = new SignerlessAccount(chainInfo);
    } else {
      const { secretKey, salt, signingKey, type } =
        await this.db.retrieveAccount(address);
      const accountManager = await this.getAccountManager(
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

  // External API methods - all require authorization

  override async getAccounts(): Promise<Aliased<AztecAddress>[]> {
    const data = await this.requestAuthorization(
      "getAccounts",
      {},
      {
        persist: true,
      }
    );
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
    const addressToCheck = await this.decodingCache.resolveContractAddress(
      instanceData,
      artifact
    );

    // Check if contract already exists in PXE
    const metadata = await this.getContractMetadata(addressToCheck);
    if (metadata.contractInstance) {
      // Contract already registered, no need to prompt
      return metadata.contractInstance;
    }

    // Resolve contract name from various sources
    const contractName = await this.decodingCache.resolveContractName(
      instanceData,
      artifact,
      addressToCheck
    );

    // Create interaction for tracking (unless skipped for batch)
    const interaction = skipAuth
      ? null
      : WalletInteraction.from({
          type: "registerContract",
          status: "REGISTERING",
          complete: false,
          title: `Register ${contractName}`,
        });

    if (interaction) {
      await this.storeAndEmitInteraction(interaction);
    }

    try {
      // Request authorization (unless skipped for batch) - no persistence needed
      if (!skipAuth) {
        await this.requestAuthorization(
          "registerContract",
          {
            address: addressToCheck.toString(),
            contractName,
          },
          { persist: false }
        );
      }

      // Register the contract with PXE
      const result = await super.registerContract(
        instanceData,
        artifact,
        secretKey
      );

      if (interaction) {
        await this.storeAndEmitInteraction(
          interaction.update({ status: "REGISTERED", complete: true })
        );
      }

      return result;
    } catch (error) {
      // Update interaction to reflect error before rethrowing
      if (interaction) {
        await this.storeAndEmitInteraction(
          interaction.update({
            complete: true,
            status: "REGISTRATION FAILED",
            description: error instanceof Error ? error.message : String(error),
          })
        );
      }
      throw error;
    }
  }

  override async registerSender(
    address: AztecAddress,
    alias: string,
    skipAuth?: boolean
  ): Promise<AztecAddress> {
    // Request authorization (unless skipped for batch) - no persistence needed
    if (!skipAuth) {
      await this.requestAuthorization(
        "registerSender",
        {
          address: address.toString(),
          alias,
        },
        { persist: false }
      );
    }

    await this.db.storeSender(address, alias);
    return this.pxe.registerSender(address);
  }

  override async getAddressBook(): Promise<Aliased<AztecAddress>[]> {
    await this.requestAuthorization("getAddressBook", {}, { persist: false });

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

  override async sendTx(
    exec: ExecutionPayload,
    opts: SendOptions,
    txInformation?: ReadableTxInformation
  ): Promise<TxHash> {
    // TODO: Remove this workaround once the app bug is fixed
    // The connected app sometimes sends transactions with empty execution payloads
    if (exec.calls.length === 0) {
      return TxHash.zero();
    }

    // Compute payload hash for deduplication and use as ID
    const payloadHash = hashExecutionPayload(exec);

    // Generate a meaningful title from the execution payload
    const title = await generateSimulationTitle(
      exec,
      this.decodingCache,
      opts.from,
      opts.fee?.embeddedPaymentMethodFeePayer
    );

    const interaction = WalletInteraction.from({
      id: payloadHash,
      type: "sendTx",
      status: "CREATING",
      complete: false,
      title: title,
    });
    await this.storeAndEmitInteraction(interaction);

    try {
      const fee = await this.getDefaultFeeOptions(opts.from, opts.fee);

      let callAuthorizations: ReadableCallAuthorization[];
      let executionTrace: DecodedExecutionTrace | undefined;

      if (!txInformation) {
        await this.storeAndEmitInteraction(
          interaction.update({ status: "COMPUTING AUTHORIZATIONS" })
        );

        const {
          simulationResult,
          txRequest: simulationTxRequest,
          decoded,
        } = await this.simulateTxInternal(
          exec,
          opts,
          interaction,
          true // withDecoding
        );
        ({ callAuthorizations, executionTrace } = decoded!);

        // Store the simulation result using the payload hash
        try {
          await this.db.storeTxSimulation(
            payloadHash,
            simulationResult,
            simulationTxRequest
          );
        } catch (storageError) {
          // If storage fails, just log it - don't fail the tx
          this.log.error(
            `Failed to store simulation result for proving: ${storageError}`
          );
        }

        await this.storeAndEmitInteraction(
          interaction.update({ status: "REQUESTING AUTHORIZATION" })
        );
      } else {
        callAuthorizations = txInformation.callAuthorizations;
      }

      // Create auth witnesses
      const authWitnesses = await Promise.all(
        callAuthorizations.map((auth) =>
          this.createAuthWit(opts.from, {
            caller: auth.rawData.caller,
            call: auth.rawData.functionCall,
          })
        )
      );
      exec.authWitnesses.push(...authWitnesses);

      // Create transaction request
      const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(
        exec,
        opts.from,
        fee
      );

      // Start proving transaction
      const provingPromise = this.pxe.proveTx(txRequest);

      // If we need authorization, wait for user approval while proving happens in parallel
      if (!txInformation) {
        await this.requestAuthorization(
          "sendTx",
          {
            callAuthorizations,
            executionTrace,
          },
          { persist: false }
        );
      }

      // Update status to proving and wait for proof to complete
      await this.storeAndEmitInteraction(
        interaction.update({ status: "PROVING" })
      );

      const provenTx = await provingPromise;

      const tx = await provenTx.toTx();
      const txHash = tx.getTxHash();
      if (await this.aztecNode.getTxEffect(txHash)) {
        throw new Error(
          `A settled tx with equal hash ${txHash.toString()} exists.`
        );
      }
      await this.aztecNode.sendTx(tx).catch((err) => {
        throw this.contextualizeError(err, inspect(tx));
      });
      await this.storeAndEmitInteraction(
        interaction.update({ status: "SENT", complete: true })
      );
      return txHash;
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

  override async batch<
    const T extends readonly BatchedMethod<keyof BatchableMethods>[],
  >(methods: T): Promise<BatchResults<T>> {
    type CachedResult =
      | ContractInstanceWithAddress
      | TxHash
      | AztecAddress
      | Promise<never>
      | null;

    // 1. Convert methods to AuthorizationItems, checking persistent cache
    const items: AuthorizationItem[] = [];
    const cachedResults: CachedResult[] = [];
    const itemMethodMap = new Map<string, string>();
    const modifiedMethods: Array<{
      name: string;
      args: unknown[];
    }> = [];

    for (const methodCall of methods) {
      const { name, args } = methodCall;
      let modifiedArgs: unknown[] = [...args]; // Create a mutable copy

      // Check persistent cache
      const persistentAuth = await this.db.retrievePersistentAuthorization(
        this.appId,
        name
      );

      if (persistentAuth) {
        cachedResults.push(persistentAuth);
        modifiedMethods.push({ name, args: modifiedArgs });
        continue;
      }

      // Create AuthorizationItem for this item
      let params: unknown = modifiedArgs;

      // Pre-process sendTx to include display data
      if (name === "sendTx") {
        try {
          const [exec, opts] = args as Parameters<typeof this.sendTx>;
          const { decoded: displayData } = await this.simulateTxInternal(
            exec,
            opts,
            undefined,
            true // withDecoding
          );
          modifiedArgs = [exec, opts, displayData];
          params = {
            originalArgs: modifiedArgs,
            callAuthorizations: displayData!.callAuthorizations,
            executionTrace: displayData!.executionTrace,
          };
        } catch (error) {
          // If simulation/extraction fails, don't add to batch
          // Push error as cached result so it gets thrown later
          cachedResults.push(Promise.reject(error));
          modifiedMethods.push({ name, args: modifiedArgs });
          continue;
        }
      } else if (name === "registerContract") {
        // Check if contract already exists in PXE
        const [instanceData, artifact, secretKey] = args as Parameters<
          typeof this.registerContract
        >;
        const address = await this.decodingCache.resolveContractAddress(
          instanceData,
          artifact
        );
        const metadata = await this.getContractMetadata(address);

        if (metadata.contractInstance) {
          // Contract already registered, skip authorization
          cachedResults.push(metadata.contractInstance);
          modifiedMethods.push({ name, args: modifiedArgs });
          continue;
        }

        // Resolve contract name from various sources
        const contractName = await this.decodingCache.resolveContractName(
          instanceData,
          artifact,
          address
        );

        // Contract not registered, need authorization
        // Add skipAuth flag to args so it bypasses auth in the execution phase
        modifiedArgs = [instanceData, artifact, secretKey, true];
        params = {
          originalArgs: modifiedArgs,
          contractAddress: address,
          contractName,
        };
      } else if (name === "registerSender") {
        // Add skipAuth flag to args
        const registerSenderArgs = args as unknown as [AztecAddress, string?];
        const [address, alias] = registerSenderArgs;
        modifiedArgs = [address, alias ?? "", true];
        params = {
          originalArgs: modifiedArgs,
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
      modifiedMethods.push({ name, args: modifiedArgs });
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
    type MethodResult = ContractInstanceWithAddress | TxHash | AztecAddress;
    type ResultWrapper = { name: string; result: MethodResult };
    const results: ResultWrapper[] = [];
    let itemIndex = 0;

    for (let i = 0; i < modifiedMethods.length; i++) {
      const { name, args } = modifiedMethods[i];
      let result: MethodResult;

      if (cachedResults[i] !== null) {
        // Use cached result (from persistent auth, PXE check, or error)
        // If it's a rejected promise (from simulation failure), await it to throw
        const cachedResult = cachedResults[i];
        if (
          cachedResult &&
          typeof (cachedResult as unknown as Promise<never>).then === "function"
        ) {
          result = await (cachedResult as Promise<never>);
        } else {
          result = cachedResult as MethodResult;
        }
      } else {
        const item = items[itemIndex];
        const itemResponse = response.itemResponses[item.id];

        if (!itemResponse || !itemResponse.approved) {
          throw new Error(`Authorization denied for ${item.method}`);
        }

        // Create interaction for trackable operations before execution
        let interaction: WalletInteraction<WalletInteractionType> | null = null;
        if (name === "registerContract") {
          const params = item.params as {
            contractAddress: AztecAddress;
            contractName: string;
          };
          interaction = WalletInteraction.from({
            type: "registerContract",
            status: "REGISTERING",
            complete: false,
            title: `Register ${params.contractName}`,
          });
          await this.storeAndEmitInteraction(interaction);
        }

        try {
          // Use dynamic dispatch to call the method, just like BaseWallet.batch()
          // The skipAuth flag (added during preprocessing) bypasses authorization
          type BatchableMethodFn = (
            ...args: unknown[]
          ) => Promise<MethodResult>;
          const fn = (this as unknown as Record<string, BatchableMethodFn>)[
            name
          ];
          result = await fn.apply(this, args);

          // Update interaction on success
          if (interaction) {
            await this.storeAndEmitInteraction(
              interaction.update({ status: "REGISTERED", complete: true })
            );
          }
        } catch (error) {
          // Update interaction on failure
          if (interaction) {
            await this.storeAndEmitInteraction(
              interaction.update({
                complete: true,
                status: "REGISTRATION FAILED",
                description:
                  error instanceof Error ? error.message : String(error),
              })
            );
          }
          throw error;
        }

        itemIndex++;
      }

      // Wrap result with method name for discriminated union deserialization
      results.push({
        name,
        result,
      });
    }

    return results as BatchResults<T>;
  }

  override async simulateTx(
    executionPayload: ExecutionPayload,
    opts: SimulateOptions,
    existingInteraction?: WalletInteraction<WalletInteractionType>
  ): Promise<TxSimulationResult> {
    const { simulationResult } = await this.simulateTxInternal(
      executionPayload,
      opts,
      existingInteraction,
      false
    );
    return simulationResult;
  }

  private async simulateTxInternal(
    executionPayload: ExecutionPayload,
    opts: SimulateOptions,
    existingInteraction?: WalletInteraction<WalletInteractionType>,
    withDecoding: boolean = false
  ): Promise<{
    simulationResult: TxSimulationResult;
    txRequest: TxExecutionRequest;
    decoded?: ReadableTxInformation;
  }> {
    // TODO: Remove this workaround once the app bug is fixed
    // The connected app sometimes sends transactions with empty execution payloads
    // Skip creating interactions for empty payloads to avoid cluttering the UI
    const hasEmptyPayload = executionPayload.calls.length === 0;

    // Generate a meaningful title and use hash as ID for deduplication
    const payloadHash = hashExecutionPayload(executionPayload);
    const title = await generateSimulationTitle(
      executionPayload,
      this.decodingCache, // Use the shared decoding cache for better contract name resolution
      opts.from, // Pass the account address to filter out entrypoint calls
      opts.fee?.embeddedPaymentMethodFeePayer
    );

    let interaction: WalletInteraction<WalletInteractionType>;

    // Only create/store interaction if payload is not empty or if one already exists
    if (!hasEmptyPayload || existingInteraction) {
      interaction =
        existingInteraction ??
        WalletInteraction.from({
          id: payloadHash, // Use hash as ID for deduplication
          type: "simulateTx",
          title,
          description: `App: ${this.appId}`,
          complete: false,
          status: "SIMULATING",
          timestamp: Date.now(), // Always update timestamp
        });
      await this.storeAndEmitInteraction(interaction);
    }

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
      const simulationResult = await this.pxe.simulateTx(
        txRequest,
        true /* simulatePublic */,
        true,
        true,
        {
          contracts: contractOverrides,
        }
      );

      // For standalone simulations (no existingInteraction), decode and request authorization
      let decoded;
      if (!existingInteraction) {
        // Always decode for standalone simulations to show the user what data will be shared
        try {
          const decodingService = new TxDecodingService(this.decodingCache);
          decoded = await decodingService.decodeTransaction(simulationResult);
        } catch (error) {
          this.log.error(`Failed to decode transaction:`, error);
          // Continue without decoded data - the simulation itself succeeded
          decoded = {
            callAuthorizations: [],
            executionTrace: {
              privateCallStack: [],
              publicExecutionQueue: [],
            },
          };
        }

        // Request authorization with composite key and custom persistence data
        if (!hasEmptyPayload) {
          await this.storeAndEmitInteraction(
            interaction.update({ status: "REQUESTING AUTHORIZATION" })
          );

          await this.requestAuthorization(
            "simulateTx",
            {
              payloadHash,
              callAuthorizations: decoded.callAuthorizations,
              executionTrace: decoded.executionTrace,
            },
            {
              persist: true,
              storageKey: `simulateTx:${payloadHash}`,
              persistData: { title: interaction.title },
            }
          );
        }

        // Store the simulation result using the payload hash
        try {
          await this.db.storeTxSimulation(
            payloadHash,
            simulationResult,
            txRequest
          );
        } catch (storageError) {
          // If storage fails, just log it - don't fail the simulation
          this.log.error(`Failed to store simulation result: ${storageError}`);
        }

        if (interaction) {
          await this.storeAndEmitInteraction(
            interaction.update({ complete: true, status: "SIMULATED" })
          );
        }
      } else {
        // For existing interactions (like sendTx flow), decode if requested
        if (withDecoding) {
          try {
            const decodingService = new TxDecodingService(this.decodingCache);
            decoded = await decodingService.decodeTransaction(simulationResult);
          } catch (error) {
            this.log.error(`Failed to decode transaction:`, error);
            // Continue without decoded data - the simulation itself succeeded
            decoded = {
              callAuthorizations: [],
              executionTrace: {
                privateCallStack: [],
                publicExecutionQueue: [],
              },
            };
          }
        }

        // Store for existing interactions too, using payload hash
        await this.db.storeTxSimulation(
          payloadHash,
          simulationResult,
          txRequest
        );
      }

      return { simulationResult, txRequest, decoded };
    } catch (error) {
      // Update interaction to reflect error before rethrowing
      if (interaction) {
        await this.storeAndEmitInteraction(
          interaction.update({
            complete: true,
            status: "SIMULATION FAILED",
            description: error instanceof Error ? error.message : String(error),
          })
        );
      }
      throw error;
    }
  }

  override async simulateUtility(
    functionName: string,
    args: any[],
    to: AztecAddress,
    authwits?: AuthWitness[],
    from?: AztecAddress
  ): Promise<UtilitySimulationResult> {
    // Generate hash for deduplication and title
    const payloadHash = hashUtilityCall(functionName, args, to, from);

    // Try to get contract name for better title using the decoding cache
    const contractName = await this.decodingCache.getAddressAlias(to);

    const interaction = WalletInteraction.from({
      id: payloadHash, // Use hash as ID for deduplication
      type: "simulateUtility",
      title: `${contractName}.${functionName}`,
      description: `App: ${this.appId}`,
      complete: false,
      status: "SIMULATING",
      timestamp: Date.now(), // Always update timestamp
    });
    await this.storeAndEmitInteraction(interaction);

    try {
      // Simulate the utility function
      const simulationResult = await this.pxe.simulateUtility(
        functionName,
        args,
        to,
        authwits,
        from
      );

      // For utility functions, create a simplified execution trace
      // Format arguments using the TxCallStackDecoder
      const decoder = new TxCallStackDecoder(this.decodingCache);
      const decodedArgs = await decoder.formatUtilityArguments(
        to,
        functionName,
        args
      );

      const simpleTrace = {
        functionName,
        args: decodedArgs,
        contractAddress: to.toString(),
        contractName,
        result: simulationResult.result,
        isUtility: true,
      };

      // Store the utility trace for later display
      try {
        await this.db.storeUtilityTrace(interaction.id, simpleTrace);
      } catch (storageError) {
        // If storage fails, just log it - don't fail the simulation
        this.log.error(`Failed to store utility trace: ${storageError}`);
      }

      // Request authorization with composite key and custom persistence data
      await this.storeAndEmitInteraction(
        interaction.update({ status: "REQUESTING AUTHORIZATION" })
      );

      await this.requestAuthorization(
        "simulateUtility",
        {
          payloadHash,
          executionTrace: simpleTrace,
          isUtility: true,
        },
        {
          persist: true,
          storageKey: `simulateUtility:${payloadHash}`,
          persistData: { title: interaction.title },
        }
      );

      await this.storeAndEmitInteraction(
        interaction.update({ complete: true, status: "SIMULATED" })
      );

      return simulationResult;
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
