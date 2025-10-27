import { ExternalOperation } from "./base-operation";
import type { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { AuthWitness } from "@aztec/stdlib/auth-witness";
import type { UtilitySimulationResult } from "@aztec/stdlib/tx";
import type { PXE } from "@aztec/pxe/server";
import { WalletInteraction, type WalletInteractionType } from "../types/wallet-interaction";
import type { WalletDB } from "../database/wallet-db";
import type { InteractionManager } from "../managers/interaction-manager";
import type { AuthorizationManager } from "../managers/authorization-manager";
import type { DecodingCache } from "../decoding/decoding-cache";
import { TxCallStackDecoder } from "../decoding/tx-callstack-decoder";
import { hashUtilityCall } from "../utils/simulation-utils";

// Utility execution trace with decoded arguments
interface UtilityExecutionTrace {
  functionName: string;
  args: unknown;
  contractAddress: string;
  contractName: string;
  result: unknown;
  isUtility: true;
}

// Arguments tuple for the operation
type SimulateUtilityArgs = [
  functionName: string,
  args: unknown[],
  to: AztecAddress,
  authwits?: AuthWitness[],
  from?: AztecAddress
];

// Result type for the operation
type SimulateUtilityResult = UtilitySimulationResult;

// Execution data stored between prepare and execute phases
interface SimulateUtilityExecutionData {
  simulationResult: UtilitySimulationResult;
  executionTrace: UtilityExecutionTrace;
  payloadHash: string;
}

// Display data for authorization UI
type SimulateUtilityDisplayData = {
  payloadHash: string;
  executionTrace: UtilityExecutionTrace;
  title: string;
  contractName: string;
} & Record<string, unknown>;

/**
 * SimulateUtility operation implementation.
 *
 * Handles utility function simulation with the following features:
 * - Simulates utility call with PXE
 * - Generates execution trace with decoded arguments
 * - Creates interaction for tracking
 * - Stores utility trace in database
 * - Supports persistent authorization based on payload hash
 */
export class SimulateUtilityOperation extends ExternalOperation<
  SimulateUtilityArgs,
  SimulateUtilityResult,
  SimulateUtilityExecutionData
> {
  protected interactionManager: InteractionManager;

  constructor(
    private pxe: PXE,
    private db: WalletDB,
    private decodingCache: DecodingCache,
    interactionManager: InteractionManager,
    private authorizationManager: AuthorizationManager
  ) {
    super();
    this.interactionManager = interactionManager;
  }

  async prepare(
    functionName: string,
    args: unknown[],
    to: AztecAddress,
    authwits?: AuthWitness[],
    from?: AztecAddress
  ): Promise<{
    earlyReturn?: SimulateUtilityResult;
    displayData?: SimulateUtilityDisplayData;
    executionData?: SimulateUtilityExecutionData;
  }> {
    // Simulate the utility function
    const simulationResult = await this.pxe.simulateUtility(
      functionName,
      args,
      to,
      authwits,
      from
    );

    // Generate hash for deduplication
    const payloadHash = hashUtilityCall(functionName, args, to, from);

    // Get contract name for better display
    const contractName = await this.decodingCache.getAddressAlias(to);

    // Format arguments using the TxCallStackDecoder
    const decoder = new TxCallStackDecoder(this.decodingCache);
    const decodedArgs = await decoder.formatUtilityArguments(
      to,
      functionName,
      args
    );

    const executionTrace = {
      functionName,
      args: decodedArgs,
      contractAddress: to.toString(),
      contractName,
      result: simulationResult.result,
      isUtility: true as const,
    };

    const title = `${contractName}.${functionName}`;

    return {
      displayData: { payloadHash, executionTrace, title, contractName },
      executionData: { simulationResult, executionTrace, payloadHash },
    };
  }

  async createInteraction(
    displayData: SimulateUtilityDisplayData
  ): Promise<WalletInteraction<WalletInteractionType>> {
    // Create interaction with payload hash as ID for deduplication
    const interaction = WalletInteraction.from({
      id: displayData.payloadHash,
      type: "simulateUtility",
      title: displayData.title,
      complete: false,
      status: "SIMULATING",
      timestamp: Date.now(),
    });

    await this.interactionManager.storeAndEmit(interaction);

    // Store the utility trace for later display
    await this.db.storeUtilityTrace(interaction.id, displayData.executionTrace);

    return interaction;
  }

  async requestAuthorization(
    displayData: SimulateUtilityDisplayData,
    interaction: WalletInteraction<WalletInteractionType>
  ): Promise<void> {
    // Update status to requesting authorization
    await this.interactionManager.storeAndEmit(
      interaction.update({ status: "REQUESTING AUTHORIZATION" })
    );

    // Request authorization with persistent caching
    // Uses payload hash as storage key so same utility calls are auto-approved
    await this.authorizationManager.requestAuthorization(
      "simulateUtility",
      {
        payloadHash: displayData.payloadHash,
        executionTrace: displayData.executionTrace,
        isUtility: true,
      },
      {
        persist: true,
        storageKey: `simulateUtility:${displayData.payloadHash}`,
        persistData: { title: displayData.title }, // Persist just the title
      }
    );
  }

  async execute(executionData: SimulateUtilityExecutionData): Promise<SimulateUtilityResult> {
    // Execution is just returning the simulation result
    // The actual simulation happened in prepare phase
    return executionData.simulationResult;
  }

  getSuccessStatus(): string {
    return "SIMULATED";
  }

  getFailureStatus(): string {
    return "SIMULATION FAILED";
  }
}
