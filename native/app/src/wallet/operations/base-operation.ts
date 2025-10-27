import type { WalletInteraction, WalletInteractionType } from "../types/wallet-interaction";
import type { InteractionManager } from "../managers/interaction-manager";
import type { AuthorizationManager } from "../managers/authorization-manager";

/**
 * Base class for external wallet operations.
 *
 * Defines the standard 3-phase pattern for all batchable operations:
 * 1. PREPARE - Pure logic, gather data, check early returns
 * 2. AUTHORIZE - Create interaction, request user permission (standalone only)
 * 3. EXECUTE - Perform the actual action
 *
 * Each operation can be called:
 * - Standalone: Full flow with authorization
 * - Batch: Prepare in Phase 1, Execute in Phase 4, Authorization handled by batch
 */
export abstract class ExternalOperation<TArgs extends unknown[], TResult, TExecutionData = unknown> {
  /**
   * PHASE 1: PREPARE
   * Pure logic with no side effects.
   *
   * @returns Prepared data including:
   *  - earlyReturn: Result if no authorization needed (e.g., already cached)
   *  - displayData: Information to show in authorization dialog
   *  - executionData: Data needed to perform the action
   */
  abstract prepare(...args: TArgs): Promise<{
    earlyReturn?: TResult;
    displayData?: Record<string, unknown>;
    executionData?: TExecutionData;
  }>;

  /**
   * PHASE 2: AUTHORIZE (Standalone only)
   * Create interaction and request user permission.
   * Operations should use their injected managers from constructor.
   *
   * @param displayData - Data to show in authorization dialog
   * @returns Object containing the created interaction for tracking
   */
  abstract authorize(
    displayData: Record<string, unknown>
  ): Promise<{ interaction: WalletInteraction<WalletInteractionType> }>;

  /**
   * PHASE 3: EXECUTE
   * Perform the actual action. Pure execution logic.
   *
   * @param executionData - Data from prepare phase
   * @returns Result of the operation
   */
  abstract execute(executionData: TExecutionData): Promise<TResult>;

  /**
   * Create interaction for batch execution.
   * Called in Phase 4 of batch flow before executing.
   * Operations should use their injected interaction manager from constructor.
   *
   * @param displayData - Data to show in interaction
   * @returns The created interaction
   */
  abstract createBatchInteraction(
    displayData: Record<string, unknown>
  ): WalletInteraction<WalletInteractionType>;

  /**
   * Update interaction on success.
   * Operations should use their injected interaction manager from constructor.
   *
   * @param interaction - The interaction to update
   */
  abstract updateInteractionSuccess(interaction: WalletInteraction<WalletInteractionType>): Promise<void>;

  /**
   * Update interaction on failure.
   * Operations should use their injected interaction manager from constructor.
   *
   * @param interaction - The interaction to update
   * @param error - The error that occurred
   */
  abstract updateInteractionFailure(interaction: WalletInteraction<WalletInteractionType>, error: unknown): Promise<void>;

  /**
   * Get success status message for interaction updates.
   */
  abstract getSuccessStatus(): string;

  /**
   * Get failure status message for interaction updates.
   */
  abstract getFailureStatus(): string;

  /**
   * Standalone execution flow: prepare → authorize → execute
   *
   * @param args - Arguments for the operation
   * @returns Result of the operation
   */
  async executeStandalone(...args: TArgs): Promise<TResult> {
    // PREPARE
    const prepared = await this.prepare(...args);

    // Early return if no authorization needed
    if (prepared.earlyReturn !== undefined) {
      return prepared.earlyReturn;
    }

    // AUTHORIZE - Create interaction and request permission
    const { interaction } = await this.authorize(prepared.displayData!);

    try {
      // EXECUTE - Perform the action
      const result = await this.execute(prepared.executionData!);

      // Update interaction on success
      await this.updateInteractionSuccess(interaction);

      return result;
    } catch (error) {
      // Update interaction on failure
      await this.updateInteractionFailure(interaction, error);
      throw error;
    }
  }

  /**
   * Batch execution flow: just execute (prepare already done, authorization handled by batch)
   *
   * @param displayData - Display data from prepare phase
   * @param executionData - Execution data from prepare phase
   * @returns Result of the operation
   */
  async executeBatch(
    displayData: Record<string, unknown>,
    executionData: TExecutionData
  ): Promise<TResult> {
    // Create interaction (batch always creates interactions)
    const interaction = this.createBatchInteraction(displayData);

    try {
      // EXECUTE - Perform the action
      const result = await this.execute(executionData);

      // Update interaction on success
      await this.updateInteractionSuccess(interaction);

      return result;
    } catch (error) {
      // Update interaction on failure
      await this.updateInteractionFailure(interaction, error);
      throw error;
    }
  }
}
