import type {
  WalletInteraction,
  WalletInteractionType,
} from "../types/wallet-interaction";
import type { InteractionManager } from "../managers/interaction-manager";
import type { AuthorizationManager } from "../managers/authorization-manager";

/**
 * Persistence configuration for authorization caching.
 */
export interface PersistenceConfig {
  storageKey: string;
  persistData: any;
}

/**
 * Result from the prepare phase of an operation.
 *
 * @template TResult - The final result type of the operation
 * @template TDisplayData - The display data type for the UI
 * @template TExecutionData - The execution data type for the execute phase
 */
export interface PrepareResult<TResult, TDisplayData, TExecutionData> {
  /**
   * If set, the operation can return early without authorization/execution.
   * Used for cached results or when the operation is already complete.
   */
  earlyReturn?: TResult;

  /**
   * Data to display in the UI and authorization dialog.
   * ALWAYS required, even if an error occurred.
   */
  displayData: TDisplayData;

  /**
   * Data needed for the execute phase.
   * Only set if prepare was successful and execution is needed.
   */
  executionData?: TExecutionData;

  /**
   * Error that occurred during prepare phase.
   * If set, authorization and execution will be skipped.
   */
  error?: Error;

  /**
   * Optional configuration for persistent authorization caching.
   * If set, the authorization can be cached and reused.
   */
  persistence?: PersistenceConfig;
}

/**
 * Base class for external wallet operations.
 *
 * Defines the standard 3-phase pattern for all batchable operations:
 * 1. PREPARE - Pure logic, gather data, check early returns
 * 2. AUTHORIZE - Create interaction, request user permission (standalone only)
 * 3. EXECUTE - Perform the actual action (pure business logic)
 *
 * Each operation can be called:
 * - Standalone: Full flow with authorization (via executeStandalone)
 * - Batch: Batch caller handles prepare, authorization, interaction creation,
 *          then calls execute() with interaction tracking
 *
 * @template TArgs - Tuple of argument types for the operation
 * @template TResult - The final result type of the operation
 * @template TExecutionData - Data passed from prepare to execute phase
 * @template TDisplayData - Data shown in UI and authorization dialog
 */
export abstract class ExternalOperation<
  TArgs extends unknown[],
  TResult,
  TExecutionData = unknown,
  TDisplayData extends Record<string, unknown> = Record<string, unknown>,
> {
  protected abstract interactionManager: InteractionManager;

  /**
   * The interaction for the current execution context.
   * Set by executeStandalone before calling execute() for progress tracking via emitProgress().
   * NOT a persistent property - only valid during execute() call.
   */
  protected interaction?: WalletInteraction<WalletInteractionType>;

  /**
   * PHASE 1: PREPARE
   * Pure logic with no side effects.
   * Must ALWAYS return displayData (even on error) so interaction can be created.
   * If an error occurs, catch it and return via error field with minimal displayData.
   *
   * @param args - Arguments for the operation
   * @returns PrepareResult containing earlyReturn, displayData, executionData, error, and persistence config
   */
  abstract prepare(
    ...args: TArgs
  ): Promise<PrepareResult<TResult, TDisplayData, TExecutionData>>;

  /**
   * PHASE 2A: CREATE INTERACTION (Standalone only)
   * Create the interaction object for tracking this operation.
   * Operations should use their injected interaction manager from constructor.
   *
   * @param displayData - Data to show in interaction
   * @returns The created interaction
   */
  abstract createInteraction(
    displayData: TDisplayData
  ): Promise<WalletInteraction<WalletInteractionType>>;

  /**
   * PHASE 2B: REQUEST AUTHORIZATION (Standalone only)
   * Request user permission for this operation.
   * Operations should use their injected authorization manager from constructor.
   *
   * @param displayData - Data to show in authorization dialog
   * @param interaction - The current interaction for progress tracking
   * @param persistence - Optional persistence configuration for authorization caching
   * @returns Promise that resolves when authorization is granted or rejects if denied
   */
  abstract requestAuthorization(
    displayData: TDisplayData,
    persistence?: PersistenceConfig
  ): Promise<void>;

  /**
   * PHASE 3: EXECUTE
   * Pure business logic for the operation. No side effects (no interaction management).
   * Operations can call emitProgress() to report intermediate status updates.
   *
   * @param executionData - Data from prepare phase
   * @returns Result of the operation
   */
  abstract execute(executionData: TExecutionData): Promise<TResult>;

  /**
   * Set the current interaction context.
   * Called by orchestrators (standalone or batch) before execute().
   */
  setCurrentInteraction(
    interaction: WalletInteraction<WalletInteractionType> | undefined
  ): void {
    this.interaction = interaction;
  }

  /**
   * Emit a progress update for the current execution interaction.
   * Safe to call from execute() or requestAuthorization() - uses the interaction from execution context.
   *
   * @param status - The status message to display
   * @param description - Optional additional description
   */
  protected async emitProgress(
    status: string,
    description?: string
  ): Promise<void> {
    if (this.interaction) {
      await this.interactionManager.storeAndEmit(
        this.interaction.update({ status, description })
      );
    }
  }

  /**
   * Get success status message for interaction updates.
   */
  abstract getSuccessStatus(): string;

  /**
   * Get failure status message for interaction updates.
   */
  abstract getFailureStatus(): string;

  /**
   * Update interaction on success.
   * Uses the operation's interactionManager and getSuccessStatus().
   *
   * @param interaction - The interaction to update
   */
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

  /**
   * Update interaction on failure.
   * Uses the operation's interactionManager and getFailureStatus().
   *
   * @param interaction - The interaction to update
   * @param error - The error that occurred
   */
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

  /**
   * Standalone execution flow: prepare → createInteraction → requestAuthorization → execute
   *
   * @param args - Arguments for the operation
   * @returns Result of the operation
   */
  async executeStandalone(...args: TArgs): Promise<TResult> {
    // PHASE 1: PREPARE
    const prepared = await this.prepare(...args);

    // Early return if no authorization needed
    if (prepared.earlyReturn !== undefined) {
      return prepared.earlyReturn;
    }

    // PHASE 2A: CREATE INTERACTION (displayData is always present now)
    const interaction = await this.createInteraction(prepared.displayData);

    // Set interaction context for emitProgress calls
    this.setCurrentInteraction(interaction);

    // Check if prepare encountered an error
    if (prepared.error) {
      // Prepare failed - track error in interaction and throw
      await this.updateInteractionFailure(interaction, prepared.error);
      throw prepared.error;
    }

    // PHASE 2B: REQUEST AUTHORIZATION
    await this.requestAuthorization(prepared.displayData, prepared.persistence);

    // PHASE 3: EXECUTE - Perform the action with interaction tracking
    const result = await this.execute(prepared.executionData!);
    await this.updateInteractionSuccess(interaction);
    return result;
  }
}
