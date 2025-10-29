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
import { BaseNativeWallet } from "./base-native-wallet";
import { ExternalOperation } from "../operations/base-operation";
import { RegisterContractOperation } from "../operations/register-contract-operation";
import { RegisterSenderOperation } from "../operations/register-sender-operation";
import { SimulateUtilityOperation } from "../operations/simulate-utility-operation";
import { SimulateTxOperation } from "../operations/simulate-tx-operation";
import { SendTxOperation } from "../operations/send-tx-operation";

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
    type BatchMethodResult =
      | ContractInstanceWithAddress
      | TxHash
      | AztecAddress
      | UtilitySimulationResult;

    interface BatchItem {
      operation: ExternalOperation<any, any, any>;
      originalName: string;
      args: any[];
      earlyReturn?: any;
      error?: any;
      displayData?: Record<string, unknown>;
      executionData?: any;
      persistence?: { storageKey: string; persistData: any };
    }

    const items: BatchItem[] = [];

    // ========================================================================
    // PHASE 0: CHECK & CREATE OPERATIONS - One instance per batch item
    // ========================================================================
    for (const methodCall of methods) {
      const { name, args } = methodCall;

      // Create a fresh operation instance for this specific batch item
      let operation: ExternalOperation<any, any, any>;

      switch (name) {
        case "registerContract":
          operation = this.createRegisterContractOperation();
          break;
        case "registerSender":
          operation = this.createRegisterSenderOperation();
          break;
        case "simulateUtility":
          operation = this.createSimulateUtilityOperation();
          break;
        case "sendTx":
          // Only create simulateTxOp when needed for sendTx operations
          const simulateTxOp = this.createSimulateTxOperation();
          operation = this.createSendTxOperation(simulateTxOp);
          break;
        default:
          items.push({
            operation: null as any,
            originalName: name,
            args,
            error: new Error(`Method ${name} is not supported in batch`),
          });
          continue;
      }

      try {
        // Run check phase
        const earlyResult = await (operation as any).check(...args);

        if (earlyResult !== undefined) {
          // Early return - no interaction needed
          items.push({
            operation,
            originalName: name,
            args,
            earlyReturn: earlyResult,
          });
        } else {
          // Normal flow - will create interaction and proceed
          items.push({
            operation,
            originalName: name,
            args,
          });
        }
      } catch (error) {
        items.push({
          operation,
          originalName: name,
          args,
          error,
        });
      }
    }

    // ========================================================================
    // PHASE 1: CREATE INTERACTIONS - For items without early return
    // ========================================================================
    for (const item of items) {
      if (item.earlyReturn !== undefined || item.error) {
        continue;
      }

      try {
        const interaction = await (item.operation as any).createInteraction(
          ...item.args
        );
        item.operation.setCurrentInteraction(interaction);
      } catch (error) {
        item.error = error;
      }
    }

    // ========================================================================
    // PHASE 2: PREPARE - Call prepare() on all operations
    // ========================================================================
    for (const item of items) {
      if (item.earlyReturn !== undefined || item.error) {
        continue;
      }

      try {
        await item.operation.emitProgress("PREPARING");
        const result = await (item.operation as any).prepare(...item.args);

        item.displayData = result.displayData;
        item.executionData = result.executionData;
        item.persistence = result.persistence;
      } catch (error) {
        const description =
          error instanceof Error ? error.message : String(error);
        await item.operation.emitProgress("ERROR", description, true);
        item.error = error;
      }
    }

    // ========================================================================
    // PHASE 3: REQUEST AUTHORIZATION - Batch all items together
    // ========================================================================
    const authItems: AuthorizationItem[] = [];
    const authItemMap = new Map<string, number>(); // itemId -> items index

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.earlyReturn !== undefined || item.error) {
        continue;
      }

      const itemId = Fr.random().toString();
      authItems.push({
        id: itemId,
        appId: this.appId,
        method: item.originalName,
        params: item.displayData!,
        timestamp: Date.now(),
        persistence: item.persistence,
      });

      authItemMap.set(itemId, i);
    }

    let response: AuthorizationResponse | null = null;

    if (authItems.length > 0) {
      // Update all interactions to "REQUESTING AUTHORIZATION"
      for (const item of items) {
        if (item.earlyReturn === undefined && !item.error) {
          await item.operation.emitProgress("REQUESTING AUTHORIZATION");
        }
      }

      response = await this.authorizationManager.requestAuthorization(authItems);
    }

    // ========================================================================
    // PHASE 4: EXECUTE - Run execute() on all authorized operations
    // ========================================================================
    const results: { name: string; result: BatchMethodResult }[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let result: BatchMethodResult;

      if (item.earlyReturn !== undefined) {
        // Early return - just use the cached result
        result = item.earlyReturn;
      } else if (item.error) {
        // Error occurred in earlier phase
        throw item.error;
      } else {
        // Check authorization
        let itemId: string | undefined;
        for (const [id, index] of authItemMap.entries()) {
          if (index === i) {
            itemId = id;
            break;
          }
        }

        if (itemId && response) {
          const itemResponse = response.itemResponses[itemId];
          if (!itemResponse || !itemResponse.approved) {
            await item.operation.emitProgress(
              "ERROR",
              "Authorization denied",
              true
            );
            throw new Error(`Authorization denied for ${item.originalName}`);
          }
        }

        // Execute the operation
        try {
          result = await item.operation.execute(item.executionData!);
        } catch (error) {
          const description =
            error instanceof Error ? error.message : String(error);
          await item.operation.emitProgress("ERROR", description, true);
          throw error;
        }
      }

      results.push({
        name: item.originalName,
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
