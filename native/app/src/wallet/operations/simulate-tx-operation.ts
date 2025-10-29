import {
  ExternalOperation,
  type PrepareResult,
  type PersistenceConfig,
} from "./base-operation";
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
}

// Display data for authorization UI
type SimulateTxDisplayData = {
  payloadHash: string;
  title: string;
  from: AztecAddress;
  decoded: ReadableTxInformation;
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
  SimulateTxExecutionData,
  SimulateTxDisplayData
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

  async check(
    _executionPayload: ExecutionPayload,
    _opts: SimulateOptions
  ): Promise<SimulateTxResult | undefined> {
    // No early return checks for this operation
    return undefined;
  }

  async prepare(
    executionPayload: ExecutionPayload,
    opts: SimulateOptions
  ): Promise<
    PrepareResult<
      SimulateTxResult,
      SimulateTxDisplayData,
      SimulateTxExecutionData
    >
  > {
    // NO TRY-CATCH - let errors throw naturally!

    // Generate payload hash and detailed title
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

    await this.db.storeTxSimulation(payloadHash, simulationResult, txRequest);

    const decodingService = new TxDecodingService(this.decodingCache);
    const decoded = await decodingService.decodeTransaction(simulationResult);

    return {
      displayData: { payloadHash, title, from: opts.from, decoded },
      executionData: {
        simulationResult,
        txRequest,
        payloadHash,
        decoded,
      },
      persistence: {
        storageKey: `simulateTx:${payloadHash}`,
        persistData: { title },
      },
    };
  }

  async createInteraction(
    executionPayload: ExecutionPayload,
    opts: SimulateOptions
  ): Promise<WalletInteraction<WalletInteractionType>> {
    // Create interaction with simple title from args only
    const payloadHash = hashExecutionPayload(executionPayload);

    const interaction = WalletInteraction.from({
      id: payloadHash,
      type: "simulateTx",
      title: "Simulate Transaction",
      description: `From: ${opts.from.toString()}`,
      complete: false,
      status: "PREPARING",
      timestamp: Date.now(),
    });

    await this.interactionManager.storeAndEmit(interaction);

    return interaction;
  }

  async requestAuthorization(
    displayData: SimulateTxDisplayData,
    persistence?: PersistenceConfig
  ): Promise<void> {
    // Update interaction with detailed title and status
    await this.emitProgress("REQUESTING AUTHORIZATION", undefined, false, {
      title: displayData.title,
    });

    // Request authorization with optional persistent caching
    await this.authorizationManager.requestAuthorization([
      {
        id: crypto.randomUUID(),
        appId: this.authorizationManager.appId,
        method: "simulateTx",
        params: {
          payloadHash: displayData.payloadHash,
          callAuthorizations: displayData.decoded.callAuthorizations,
          executionTrace: displayData.decoded.executionTrace,
          title: displayData.title,
          from: displayData.from.toString(),
        },
        timestamp: Date.now(),
        persistence,
      },
    ]);
  }

  async execute(
    executionData: SimulateTxExecutionData
  ): Promise<SimulateTxResult> {
    await this.emitProgress("SUCCESS", undefined, true);
    return executionData.simulationResult;
  }
}
