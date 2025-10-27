import { ExternalOperation } from "./base-operation";
import type { AztecAddress } from "@aztec/stdlib/aztec-address";
import {
  ExecutionPayload,
  mergeExecutionPayloads,
} from "@aztec/entrypoints/payload";
import type { TxSimulationResult, TxExecutionRequest } from "@aztec/stdlib/tx";
import type { PXE } from "@aztec/pxe/server";
import { Fr } from "@aztec/foundation/fields";
import {
  WalletInteraction,
  type WalletInteractionType,
} from "../types/wallet-interaction";
import type { WalletDB } from "../database/wallet-db";
import type { InteractionManager } from "../managers/interaction-manager";
import type { AuthorizationManager } from "../managers/authorization-manager";
import type { DecodingCache } from "../decoding/decoding-cache";
import type { DefaultAccountEntrypointOptions } from "@aztec/entrypoints/account";
import { TxDecodingService } from "../decoding/tx-decoding-service";
import type { ReadableCallAuthorization } from "../decoding/call-authorization-formatter";
import type { DecodedExecutionTrace } from "../decoding/tx-callstack-decoder";
import {
  hashExecutionPayload,
  generateSimulationTitle,
} from "../utils/simulation-utils";
import type { FeeOptions, SimulateOptions } from "@aztec/aztec.js/wallet";
import type { Logger } from "@aztec/aztec.js/log";
import type { ContractInstanceWithAddress } from "@aztec/stdlib/contract";
import type { ContractArtifact } from "@aztec/stdlib/abi";

// Readable transaction information with decoded data
interface ReadableTxInformation {
  callAuthorizations: ReadableCallAuthorization[];
  executionTrace: DecodedExecutionTrace;
}

// Fake account data structure
interface FakeAccountData {
  account: {
    createTxExecutionRequest: (
      payload: ExecutionPayload,
      gasSettings: unknown,
      options: DefaultAccountEntrypointOptions
    ) => Promise<TxExecutionRequest>;
  };
  instance: ContractInstanceWithAddress;
  artifact: ContractArtifact;
}

// Arguments tuple for the operation
type SimulateTxArgs = [
  executionPayload: ExecutionPayload,
  opts: SimulateOptions,
  existingInteraction?: WalletInteraction<WalletInteractionType>,
];

// Result type for the operation
type SimulateTxResult = TxSimulationResult;

// Execution data stored between prepare and execute phases
interface SimulateTxExecutionData {
  simulationResult: TxSimulationResult;
  txRequest: TxExecutionRequest;
  payloadHash: string;
  decoded?: ReadableTxInformation;
  hasEmptyPayload: boolean;
}

// Display data for authorization UI
type SimulateTxDisplayData = {
  payloadHash: string;
  title: string;
  decoded: ReadableTxInformation;
  hasEmptyPayload: boolean;
} & Record<string, unknown>;

/**
 * SimulateTx operation implementation.
 *
 * Handles transaction simulation with the following features:
 * - Fee options processing (gas estimation, payment methods)
 * - Fake account creation for simulation
 * - Transaction execution request creation
 * - Transaction decoding with call authorizations and execution traces
 * - Persistent authorization based on payload hash
 * - Storage of simulation results
 * - Support for existing interactions (e.g., from sendTx flow)
 */
export class SimulateTxOperation extends ExternalOperation<
  SimulateTxArgs,
  SimulateTxResult,
  SimulateTxExecutionData
> {
  protected interactionManager: InteractionManager;

  constructor(
    private pxe: PXE,
    private db: WalletDB,
    private decodingCache: DecodingCache,
    interactionManager: InteractionManager,
    private authorizationManager: AuthorizationManager,
    private getFeeOptionsForGasEstimation: (
      from: AztecAddress,
      fee: SimulateOptions["fee"]
    ) => Promise<FeeOptions>,
    private getDefaultFeeOptions: (
      from: AztecAddress,
      fee: SimulateOptions["fee"]
    ) => Promise<FeeOptions>,
    private getFakeAccountDataFor: (
      address: AztecAddress
    ) => Promise<FakeAccountData>,
    private cancellableTransactions: boolean,
    private appId: string,
    private log: Logger
  ) {
    super();
    this.interactionManager = interactionManager;
  }

  async prepare(
    executionPayload: ExecutionPayload,
    opts: SimulateOptions,
    existingInteraction?: WalletInteraction<WalletInteractionType>
  ): Promise<{
    earlyReturn?: SimulateTxResult;
    displayData?: SimulateTxDisplayData;
    executionData?: SimulateTxExecutionData;
  }> {
    // Check for empty payload (temporary workaround for app bug)
    const hasEmptyPayload = executionPayload.calls.length === 0;

    // Generate payload hash and title
    const payloadHash = hashExecutionPayload(executionPayload);
    const title = await generateSimulationTitle(
      executionPayload,
      this.decodingCache,
      opts.from,
      opts.fee?.embeddedPaymentMethodFeePayer
    );

    // Process fee options
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

    // Create transaction execution request
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

    // Simulate the transaction
    const simulationResult = await this.pxe.simulateTx(
      txRequest,
      true /* simulatePublic */,
      true,
      true,
      { contracts: contractOverrides }
    );

    const decodingService = new TxDecodingService(this.decodingCache);
    const decoded = await decodingService.decodeTransaction(simulationResult);

    return {
      displayData: { payloadHash, title, decoded, hasEmptyPayload },
      executionData: {
        simulationResult,
        txRequest,
        payloadHash,
        decoded,
        hasEmptyPayload,
      },
    };
  }

  async createInteraction(
    displayData: SimulateTxDisplayData
  ): Promise<WalletInteraction<WalletInteractionType>> {
    // Create interaction with payload hash as ID for deduplication
    const interaction = WalletInteraction.from({
      id: displayData.payloadHash,
      type: "simulateTx",
      title: displayData.title,
      description: `App: ${this.appId}`,
      complete: false,
      status: "SIMULATING",
      timestamp: Date.now(),
    });

    await this.interactionManager.storeAndEmit(interaction);

    return interaction;
  }

  async requestAuthorization(
    displayData: SimulateTxDisplayData,
    interaction: WalletInteraction<WalletInteractionType>
  ): Promise<void> {
    // Update status to requesting authorization
    await this.interactionManager.storeAndEmit(
      interaction.update({ status: "REQUESTING AUTHORIZATION" })
    );

    // Request authorization with persistent caching
    await this.authorizationManager.requestAuthorization(
      "simulateTx",
      {
        payloadHash: displayData.payloadHash,
        callAuthorizations: displayData.decoded.callAuthorizations,
        executionTrace: displayData.decoded.executionTrace,
      },
      {
        persist: true,
        storageKey: `simulateTx:${displayData.payloadHash}`,
        persistData: { title: displayData.title },
      }
    );
  }

  async execute(
    executionData: SimulateTxExecutionData
  ): Promise<SimulateTxResult> {
    // Store the simulation result using the payload hash
    if (!executionData.hasEmptyPayload) {
      try {
        await this.db.storeTxSimulation(
          executionData.payloadHash,
          executionData.simulationResult,
          executionData.txRequest
        );
      } catch (storageError) {
        // If storage fails, just log it - don't fail the simulation
        this.log.error(`Failed to store simulation result: ${storageError}`);
      }
    }

    return executionData.simulationResult;
  }

  getSuccessStatus(): string {
    return "SIMULATED";
  }

  getFailureStatus(): string {
    return "SIMULATION FAILED";
  }
}
