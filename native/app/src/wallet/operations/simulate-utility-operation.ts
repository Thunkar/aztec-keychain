import {
  ExternalOperation,
  type PrepareResult,
  type PersistenceConfig,
} from "./base-operation";
import type { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { AuthWitness } from "@aztec/stdlib/auth-witness";
import type { UtilitySimulationResult } from "@aztec/stdlib/tx";
import type { PXE } from "@aztec/pxe/server";
import {
  WalletInteraction,
  type WalletInteractionType,
} from "../types/wallet-interaction";
import type { WalletDB } from "../database/wallet-db";
import type { InteractionManager } from "../managers/interaction-manager";
import type { AuthorizationManager } from "../managers/authorization-manager";
import type { DecodingCache } from "../decoding/decoding-cache";
import { TxCallStackDecoder } from "../decoding/tx-callstack-decoder";
import { hashUtilityCall } from "../utils/simulation-utils";

// Utility execution trace with decoded arguments and formatted result
interface UtilityExecutionTrace {
  functionName: string;
  args: unknown;
  contractAddress: string;
  contractName: string;
  result: string;
  isUtility: true;
}

// Arguments tuple for the operation
type SimulateUtilityArgs = [
  functionName: string,
  args: unknown[],
  to: AztecAddress,
  authwits?: AuthWitness[],
  from?: AztecAddress,
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
  SimulateUtilityExecutionData,
  SimulateUtilityDisplayData
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

  async check(
    _functionName: string,
    _args: unknown[],
    _to: AztecAddress,
    _authwits?: AuthWitness[],
    _from?: AztecAddress
  ): Promise<SimulateUtilityResult | undefined> {
    // No early return checks for this operation
    return undefined;
  }

  async createInteraction(
    functionName: string,
    args: unknown[],
    to: AztecAddress,
    _authwits?: AuthWitness[],
    from?: AztecAddress
  ): Promise<WalletInteraction<WalletInteractionType>> {
    // Create interaction with simple title from args only
    const payloadHash = hashUtilityCall(functionName, args, to, from);

    const interaction = WalletInteraction.from({
      id: payloadHash,
      type: "simulateUtility",
      title: `Simulate Utility: ${functionName}`,
      description: `Contract: ${to.toString()}`,
      complete: false,
      status: "PREPARING",
      timestamp: Date.now(),
    });

    await this.interactionManager.storeAndEmit(interaction);

    return interaction;
  }

  async prepare(
    functionName: string,
    args: unknown[],
    to: AztecAddress,
    authwits?: AuthWitness[],
    from?: AztecAddress
  ): Promise<
    PrepareResult<
      SimulateUtilityResult,
      SimulateUtilityDisplayData,
      SimulateUtilityExecutionData
    >
  > {
    // NO TRY-CATCH - let errors throw naturally!

    // Generate hash for deduplication
    const payloadHash = hashUtilityCall(functionName, args, to, from);

    // Simulate the utility function
    const simulationResult = await this.pxe.simulateUtility(
      functionName,
      args,
      to,
      authwits,
      from
    );

    // Get contract name for better display
    const contractName = await this.decodingCache.getAddressAlias(to);

    // Format arguments and result using the TxCallStackDecoder
    const decoder = new TxCallStackDecoder(this.decodingCache);
    const decodedArgs = await decoder.formatUtilityArguments(
      to,
      functionName,
      args
    );
    const formattedResult = await decoder.formatUtilityResult(
      to,
      functionName,
      simulationResult.result
    );

    const executionTrace = {
      functionName,
      args: decodedArgs,
      contractAddress: to.toString(),
      contractName,
      result: formattedResult,
      isUtility: true as const,
    };

    const title = `${contractName}.${functionName}`;

    // Store the utility trace for display
    await this.db.storeUtilityTrace(payloadHash, executionTrace);

    return {
      displayData: { payloadHash, executionTrace, title, contractName },
      executionData: { simulationResult, executionTrace, payloadHash },
      persistence: {
        storageKey: `simulateUtility:${payloadHash}`,
        persistData: { title },
      },
    };
  }

  async requestAuthorization(
    displayData: SimulateUtilityDisplayData,
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
        method: "simulateUtility",
        params: {
          payloadHash: displayData.payloadHash,
          executionTrace: displayData.executionTrace,
          isUtility: true,
        },
        timestamp: Date.now(),
        persistence,
      },
    ]);
  }

  async execute(
    executionData: SimulateUtilityExecutionData
  ): Promise<SimulateUtilityResult> {
    // Execution is just returning the simulation result
    // The actual simulation happened in prepare phase
    await this.emitProgress("SUCCESS", undefined, true);
    return executionData.simulationResult;
  }
}
