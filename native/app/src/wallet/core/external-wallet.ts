import { type Account, type ChainInfo } from "@aztec/aztec.js/account";
import {
  type Aliased,
  type SimulateOptions,
  type SendOptions,
  type BatchedMethod,
  type BatchableMethods,
  type BatchResults,
  type ContractInstanceAndArtifact,
} from "@aztec/aztec.js/wallet";
import { type AztecNode } from "@aztec/aztec.js/node";
import { type Logger } from "@aztec/aztec.js/log";
import type { AuthWitness } from "@aztec/stdlib/auth-witness";
import { type ContractArtifact } from "@aztec/stdlib/abi";
import type {
  ContractInstanceWithAddress,
  ContractInstantiationData,
} from "@aztec/stdlib/contract";
import { ExecutionPayload } from "@aztec/entrypoints/payload";
import { Fr } from "@aztec/foundation/fields";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import {
  type TxSimulationResult,
  type UtilitySimulationResult,
  TxHash,
} from "@aztec/stdlib/tx";
import { type PXE } from "@aztec/pxe/server";
import { WalletDB } from "../database/wallet-db";
import { type PromiseWithResolvers } from "@aztec/foundation/promise";
import {
  type AuthorizationRequest,
  type AuthorizationResponse,
  type AuthorizationItem,
  type GetAccountsAuthData,
  type GetAddressBookAuthData,
} from "../types/authorization";
import type { ReadableCallAuthorization } from "../decoding/call-authorization-formatter";
import { type DecodedExecutionTrace } from "../decoding/tx-callstack-decoder";
import { BaseNativeWallet } from "./base-native-wallet";
import { ExternalOperation } from "../operations/base-operation";
import { RegisterContractOperation } from "../operations/register-contract-operation";
import { RegisterSenderOperation } from "../operations/register-sender-operation";
import { SimulateUtilityOperation } from "../operations/simulate-utility-operation";
import { SimulateTxOperation } from "../operations/simulate-tx-operation";
import { SendTxOperation } from "../operations/send-tx-operation";

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
   * Factory method to create a fresh RegisterContractOperation instance.
   */
  private createRegisterContractOperation(): RegisterContractOperation {
    return new RegisterContractOperation(
      this.pxe,
      this.decodingCache,
      this.interactionManager,
      this.authorizationManager
    );
  }

  /**
   * Factory method to create a fresh RegisterSenderOperation instance.
   */
  private createRegisterSenderOperation(): RegisterSenderOperation {
    return new RegisterSenderOperation(
      this.pxe,
      this.db,
      this.interactionManager,
      this.authorizationManager
    );
  }

  /**
   * Factory method to create a fresh SimulateUtilityOperation instance.
   */
  private createSimulateUtilityOperation(): SimulateUtilityOperation {
    return new SimulateUtilityOperation(
      this.pxe,
      this.db,
      this.decodingCache,
      this.interactionManager,
      this.authorizationManager
    );
  }

  /**
   * Factory method to create a fresh SimulateTxOperation instance.
   */
  private createSimulateTxOperation(): SimulateTxOperation {
    return new SimulateTxOperation(
      this.pxe,
      this.db,
      this.decodingCache,
      this.interactionManager,
      this.authorizationManager,
      this.getFeeOptionsForGasEstimation.bind(this),
      this.getDefaultFeeOptions.bind(this),
      this.getFakeAccountDataFor.bind(this),
      this.cancellableTransactions,
      this.appId,
      this.log
    );
  }

  /**
   * Factory method to create a fresh SendTxOperation instance.
   * @param simulateTxOp - The SimulateTxOperation instance to use (may be fresh or shared)
   */
  private createSendTxOperation(
    simulateTxOp: SimulateTxOperation
  ): SendTxOperation {
    return new SendTxOperation(
      this.pxe,
      this.aztecNode,
      this.db,
      this.decodingCache,
      this.interactionManager,
      this.authorizationManager,
      simulateTxOp,
      this.createAuthWit.bind(this),
      this.createTxExecutionRequestFromPayloadAndFee.bind(this),
      this.getDefaultFeeOptions.bind(this),
      this.contextualizeError.bind(this)
    );
  }

  /**
   * Retrieves an account by address, with authorization check.
   *
   * This method ensures the app has permission to access the requested account
   * by checking the persistent getAccounts authorization. Only accounts that
   * the user explicitly authorized can be accessed.
   *
   * @param address - The account address to retrieve
   * @returns Account instance for the given address
   * @throws Error if app doesn't have authorization for this account
   */
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

    // Authorization passed, delegate to base implementation
    return this.getAccountFromAddressInternal(address);
  }

  // External API methods - all require authorization

  override async getAccounts(): Promise<Aliased<AztecAddress>[]> {
    const itemId = crypto.randomUUID();
    const response = await this.authorizationManager.requestAuthorization([
      {
        id: itemId,
        appId: this.appId,
        method: "getAccounts",
        params: {},
        timestamp: Date.now(),
        persistence: {
          storageKey: "getAccounts",
          persistData: null, // Will be filled from response.data
        },
      },
    ]);

    // Extract the single item response
    const itemResponse = response.itemResponses[itemId];
    const authData = itemResponse?.data as GetAccountsAuthData;

    if (!authData || !authData.accounts) {
      throw new Error("Authorization response missing account data");
    }

    const { accounts } = authData;
    return accounts.map((acc: any) => ({
      alias: acc.alias,
      item: AztecAddress.fromString(acc.item),
    }));
  }

  /**
   * Register a contract with the wallet.
   * Uses the RegisterContractOperation for clean separation of concerns.
   */
  override async registerContract(
    instanceData:
      | AztecAddress
      | ContractInstanceWithAddress
      | ContractInstantiationData
      | ContractInstanceAndArtifact,
    artifact?: ContractArtifact,
    secretKey?: Fr
  ): Promise<ContractInstanceWithAddress> {
    const op = this.createRegisterContractOperation();
    return await op.executeStandalone(instanceData, artifact, secretKey);
  }

  override async registerSender(
    address: AztecAddress,
    alias: string
  ): Promise<AztecAddress> {
    const op = this.createRegisterSenderOperation();
    return await op.executeStandalone(address, alias);
  }

  override async getAddressBook(): Promise<Aliased<AztecAddress>[]> {
    const itemId = crypto.randomUUID();
    const response = await this.authorizationManager.requestAuthorization([
      {
        id: itemId,
        appId: this.appId,
        method: "getAddressBook",
        params: {},
        timestamp: Date.now(),
        persistence: {
          storageKey: "getAddressBook",
          persistData: null, // Will be filled from response.data
        },
      },
    ]);

    // Extract the single item response
    const itemResponse = response.itemResponses[itemId];
    const authData = itemResponse?.data as GetAddressBookAuthData;

    if (!authData || !authData.contacts) {
      throw new Error("Authorization response missing contact data");
    }

    const { contacts } = authData;
    return contacts.map((contact: any) => ({
      alias: contact.alias,
      item: AztecAddress.fromString(contact.item),
    }));
  }

  override async sendTx(
    exec: ExecutionPayload,
    opts: SendOptions
  ): Promise<TxHash> {
    const simulateTxOp = this.createSimulateTxOperation();
    const op = this.createSendTxOperation(simulateTxOp);
    return await op.executeStandalone(exec, opts);
  }

  override async batch<
    const T extends readonly BatchedMethod<keyof BatchableMethods>[],
  >(methods: T): Promise<BatchResults<T>> {
    // Create fresh operation instances for batch execution to avoid state leakage
    // Each operation in the batch gets its own clean instance
    const simulateTxOp = this.createSimulateTxOperation();
    const operationMap = {
      registerContract: this.createRegisterContractOperation(),
      registerSender: this.createRegisterSenderOperation(),
      simulateUtility: this.createSimulateUtilityOperation(),
      sendTx: this.createSendTxOperation(simulateTxOp),
    } as const;

    type BatchMethodResult =
      | ContractInstanceWithAddress
      | TxHash
      | AztecAddress
      | UtilitySimulationResult;

    // ========================================================================
    // PHASE 1: PREPARE - Call prepare() on all operations
    // ========================================================================
    interface PreparedOperation {
      operation: ExternalOperation<any, any, any>;
      originalName: string;
      displayData?: Record<string, unknown>;
      executionData?: any;
      earlyReturn?: any;
      error?: any;
      persistence?: { storageKey: string; persistData: any };
    }

    const prepared: PreparedOperation[] = [];

    for (const methodCall of methods) {
      const { name, args } = methodCall;
      const operation = operationMap[name as keyof typeof operationMap];

      if (!operation) {
        // Method doesn't have an operation (e.g., getAccounts, getAddressBook)
        // Fall back to direct execution
        prepared.push({
          operation: null as any,
          originalName: name,
          error: new Error(`Method ${name} is not supported in batch`),
        });
        continue;
      }

      try {
        // Call prepare with the method's arguments
        const result = await (operation as any).prepare(...args);

        prepared.push({
          operation,
          originalName: name,
          displayData: result.displayData,
          executionData: result.executionData,
          earlyReturn: result.earlyReturn,
          persistence: result.persistence,
        });
      } catch (error) {
        // Prepare failed - store error to throw later
        prepared.push({
          operation,
          originalName: name,
          error,
        });
      }
    }

    // ========================================================================
    // PHASE 2: Filter items needing authorization
    // ========================================================================
    const items: AuthorizationItem[] = [];
    const itemIndexMap = new Map<string, number>(); // itemId -> prepared index

    for (let i = 0; i < prepared.length; i++) {
      const prep = prepared[i];

      // Skip if early return or error
      if (prep.earlyReturn !== undefined || prep.error) {
        continue;
      }

      // Create authorization item with persistence config from prepare
      const itemId = Fr.random().toString();
      items.push({
        id: itemId,
        appId: this.appId,
        method: prep.originalName,
        params: prep.displayData,
        timestamp: Date.now(),
        persistence: prep.persistence, // Include persistence config directly
      });

      itemIndexMap.set(itemId, i);
    }

    // ========================================================================
    // PHASE 3: Request authorization
    // ========================================================================
    let response: AuthorizationResponse | null = null;

    if (items.length > 0) {
      response = await this.authorizationManager.requestAuthorization(items);
    }

    // ========================================================================
    // PHASE 4: EXECUTE - Call execute() with interaction tracking on all operations
    // ========================================================================
    type ResultWrapper = { name: string; result: BatchMethodResult };
    const results: ResultWrapper[] = [];

    for (let i = 0; i < prepared.length; i++) {
      const prep = prepared[i];
      let result: BatchMethodResult;

      // Handle early returns
      if (prep.earlyReturn !== undefined) {
        result = prep.earlyReturn;
      }
      // Handle prepare errors
      else if (prep.error) {
        throw prep.error;
      }
      // Execute the operation
      else {
        // Find the authorization item for this operation
        let itemId: string | undefined;
        for (const [id, index] of itemIndexMap.entries()) {
          if (index === i) {
            itemId = id;
            break;
          }
        }

        // Verify authorization if needed
        if (itemId && response) {
          const itemResponse = response.itemResponses[itemId];
          if (!itemResponse || !itemResponse.approved) {
            throw new Error(`Authorization denied for ${prep.originalName}`);
          }
        }

        // Execute with interaction tracking
        // Create interaction
        const interaction = await prep.operation.createInteraction(
          prep.displayData!
        );

        // Set current interaction for progress tracking
        prep.operation.setCurrentInteraction(interaction);

        try {
          // Execute the operation
          result = await prep.operation.execute(prep.executionData!);

          // Update interaction on success
          await prep.operation.updateInteractionSuccess(interaction);
        } catch (error) {
          // Update interaction on failure
          await prep.operation.updateInteractionFailure(interaction, error);
          throw error;
        } finally {
          // Clear current interaction
          prep.operation.setCurrentInteraction(undefined);
        }
      }

      // Wrap result for BatchResults type
      results.push({
        name: prep.originalName,
        result,
      });
    }

    return results as BatchResults<T>;
  }

  override async simulateTx(
    executionPayload: ExecutionPayload,
    opts: SimulateOptions
  ): Promise<TxSimulationResult> {
    const op = this.createSimulateTxOperation();
    return await op.executeStandalone(executionPayload, opts);
  }

  /**
   * Public method: Simulate utility function (standalone call).
   * Handles interaction tracking and user authorization.
   */
  override async simulateUtility(
    functionName: string,
    args: unknown[],
    to: AztecAddress,
    authwits?: AuthWitness[],
    from?: AztecAddress
  ): Promise<UtilitySimulationResult> {
    const op = this.createSimulateUtilityOperation();
    return await op.executeStandalone(functionName, args, to, authwits, from);
  }
}
