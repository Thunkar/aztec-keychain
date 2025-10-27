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
  [functionName: string, args: unknown[], to: AztecAddress, authwits?: AuthWitness[], from?: AztecAddress],
  UtilitySimulationResult,
  {
    simulationResult: UtilitySimulationResult;
    executionTrace: {
      functionName: string;
      args: unknown;
      contractAddress: string;
      contractName: string;
      result: unknown;
      isUtility: true;
    };
    payloadHash: string;
  }
> {
  constructor(
    private pxe: PXE,
    private db: WalletDB,
    private decodingCache: DecodingCache,
    private interactionManager: InteractionManager,
    private authorizationManager: AuthorizationManager
  ) {
    super();
  }

  async prepare(
    functionName: string,
    args: unknown[],
    to: AztecAddress,
    authwits?: AuthWitness[],
    from?: AztecAddress
  ): Promise<{
    earlyReturn?: UtilitySimulationResult;
    displayData?: {
      payloadHash: string;
      executionTrace: {
        functionName: string;
        args: unknown;
        contractAddress: string;
        contractName: string;
        result: unknown;
        isUtility: true;
      };
      title: string;
      contractName: string;
    };
    executionData?: {
      simulationResult: UtilitySimulationResult;
      executionTrace: {
        functionName: string;
        args: unknown;
        contractAddress: string;
        contractName: string;
        result: unknown;
        isUtility: true;
      };
      payloadHash: string;
    };
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

  async authorize(
    displayData: {
      payloadHash: string;
      executionTrace: {
        functionName: string;
        args: unknown;
        contractAddress: string;
        contractName: string;
        result: unknown;
        isUtility: true;
      };
      title: string;
    }
  ): Promise<{ interaction: WalletInteraction<WalletInteractionType> }> {
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

    // Update status to requesting authorization
    await this.interactionManager.storeAndEmit(
      interaction.update({ status: "REQUESTING AUTHORIZATION" })
    );

    // Request authorization with persistent caching
    // Uses payload hash as storage key so same utility calls are auto-approved
    await this.authorizationManager.requestPersistent(
      "simulateUtility",
      {
        payloadHash: displayData.payloadHash,
        executionTrace: displayData.executionTrace,
        isUtility: true,
      },
      `simulateUtility:${displayData.payloadHash}`,
      { title: displayData.title } // Persist just the title
    );

    return { interaction };
  }

  async execute(executionData: {
    simulationResult: UtilitySimulationResult;
    executionTrace: {
      functionName: string;
      args: unknown;
      contractAddress: string;
      contractName: string;
      result: unknown;
      isUtility: true;
    };
    payloadHash: string;
  }): Promise<UtilitySimulationResult> {
    // Execution is just returning the simulation result
    // The actual simulation happened in prepare phase
    return executionData.simulationResult;
  }

  createBatchInteraction(displayData: {
    payloadHash: string;
    executionTrace: {
      functionName: string;
      args: unknown;
      contractAddress: string;
      contractName: string;
      result: unknown;
      isUtility: true;
    };
    title: string;
  }): WalletInteraction<WalletInteractionType> {
    const interaction = WalletInteraction.from({
      id: displayData.payloadHash,
      type: "simulateUtility",
      title: displayData.title,
      complete: false,
      status: "SIMULATING",
      timestamp: Date.now(),
    });
    // Store immediately and also store utility trace
    this.interactionManager.storeAndEmit(interaction);
    this.db.storeUtilityTrace(displayData.payloadHash, displayData.executionTrace);
    return interaction;
  }

  async updateInteractionSuccess(interaction: WalletInteraction<WalletInteractionType>): Promise<void> {
    await this.interactionManager.storeAndEmit(
      interaction.update({
        status: this.getSuccessStatus(),
        complete: true,
      })
    );
  }

  async updateInteractionFailure(interaction: WalletInteraction<WalletInteractionType>, error: unknown): Promise<void> {
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
