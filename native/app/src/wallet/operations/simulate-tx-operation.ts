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

type ReadableTxInformation = {
  callAuthorizations: ReadableCallAuthorization[];
  executionTrace: DecodedExecutionTrace;
};

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
  [
    executionPayload: ExecutionPayload,
    opts: SimulateOptions,
    existingInteraction?: WalletInteraction<WalletInteractionType>,
  ],
  TxSimulationResult,
  {
    simulationResult: TxSimulationResult;
    txRequest: TxExecutionRequest;
    payloadHash: string;
    decoded?: ReadableTxInformation;
    hasEmptyPayload: boolean;
  }
> {
  constructor(
    private pxe: PXE,
    private db: WalletDB,
    private decodingCache: DecodingCache,
    private interactionManager: InteractionManager,
    private authorizationManager: AuthorizationManager,
    private getFeeOptionsForGasEstimation: (
      from: AztecAddress,
      fee: any
    ) => Promise<FeeOptions>,
    private getDefaultFeeOptions: (
      from: AztecAddress,
      fee: any
    ) => Promise<FeeOptions>,
    private getFakeAccountDataFor: (address: AztecAddress) => Promise<{
      account: any;
      instance: any;
      artifact: any;
    }>,
    private cancellableTransactions: boolean,
    private appId: string,
    private log: any
  ) {
    super();
  }

  async prepare(
    executionPayload: ExecutionPayload,
    opts: SimulateOptions,
    existingInteraction?: WalletInteraction<WalletInteractionType>
  ): Promise<{
    earlyReturn?: TxSimulationResult;
    displayData?: {
      payloadHash: string;
      title: string;
      decoded: ReadableTxInformation;
      hasEmptyPayload: boolean;
    };
    executionData?: {
      simulationResult: TxSimulationResult;
      txRequest: TxExecutionRequest;
      payloadHash: string;
      decoded?: ReadableTxInformation;
      hasEmptyPayload: boolean;
    };
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

    // Decode transaction for standalone simulations (not for existingInteraction like sendTx flow)
    let decoded: ReadableTxInformation | undefined;
    if (!existingInteraction) {
      try {
        const decodingService = new TxDecodingService(this.decodingCache);
        decoded = await decodingService.decodeTransaction(simulationResult);
      } catch (error) {
        this.log.error(`Failed to decode transaction:`, error);
        // Continue without decoded data - the simulation itself succeeded
        decoded = {
          callAuthorizations: [],
          executionTrace: {
            privateExecution: {
              type: "private-call" as const,
              depth: 0,
              counter: { start: 0, end: 0 },
              contract: { name: "Unknown", address: "0x0" },
              function: "unknown",
              caller: { name: "Unknown", address: "0x0" },
              isStaticCall: false,
              args: [],
              returnValues: [],
              nestedEvents: [],
            },
            publicExecutionQueue: [],
          },
        };
      }
    }

    return {
      displayData: decoded
        ? { payloadHash, title, decoded, hasEmptyPayload }
        : undefined,
      executionData: {
        simulationResult,
        txRequest,
        payloadHash,
        decoded,
        hasEmptyPayload,
      },
    };
  }

  async authorize(displayData: {
    payloadHash: string;
    title: string;
    decoded: ReadableTxInformation;
    hasEmptyPayload: boolean;
  }): Promise<{ interaction: WalletInteraction<WalletInteractionType> }> {
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

    // Only store interaction if payload is not empty (workaround for app bug)
    if (!displayData.hasEmptyPayload) {
      await this.interactionManager.storeAndEmit(interaction);

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

    return { interaction };
  }

  async execute(executionData: {
    simulationResult: TxSimulationResult;
    txRequest: TxExecutionRequest;
    payloadHash: string;
    decoded?: ReadableTxInformation;
    hasEmptyPayload: boolean;
  }): Promise<TxSimulationResult> {
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

  createBatchInteraction(displayData: {
    payloadHash: string;
    title: string;
    decoded: ReadableTxInformation;
    hasEmptyPayload: boolean;
  }): WalletInteraction<WalletInteractionType> {
    const interaction = WalletInteraction.from({
      id: displayData.payloadHash,
      type: "simulateTx",
      title: displayData.title,
      description: `App: ${this.appId}`,
      complete: false,
      status: "SIMULATING",
      timestamp: Date.now(),
    });

    // Store immediately if not empty payload
    if (!displayData.hasEmptyPayload) {
      this.interactionManager.storeAndEmit(interaction);
    }

    return interaction;
  }

  async updateInteractionSuccess(
    interaction: WalletInteraction<WalletInteractionType>
  ): Promise<void> {
    await this.interactionManager.storeAndEmit(
      interaction.update({
        status: this.getSuccessStatus(),
        complete: true,
      })
    );
  }

  async updateInteractionFailure(
    interaction: WalletInteraction<WalletInteractionType>,
    error: unknown
  ): Promise<void> {
    await this.interactionManager.storeAndEmit(
      interaction.update({
        complete: true,
        status: this.getFailureStatus(),
        description: error instanceof Error ? error.message : String(error),
      })
    );
  }

  getSuccessStatus(): string {
    return "SIMULATED";
  }

  getFailureStatus(): string {
    return "SIMULATION FAILED";
  }
}
