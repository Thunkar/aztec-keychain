import type {
  WalletInteraction,
  WalletInteractionType,
} from "../types/wallet-interaction";
import type { InteractionManager } from "../managers/interaction-manager";
import type { AuthorizationManager } from "../managers/authorization-manager";

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
 */
export abstract class ExternalOperation<
  TArgs extends unknown[],
  TResult,
  TExecutionData = unknown,
> {
  protected abstract interactionManager: InteractionManager;

  /**
   * The current interaction being executed.
   * Set before execute() by the caller (standalone or batch) for progress tracking.
   */
  protected currentInteraction?: WalletInteraction<WalletInteractionType>;

  /**
   * Persistence configuration for the current execution.
   * Set during prepare() phase if the operation supports persistent authorization.
   */
  protected persistenceConfig?: { storageKey: string; persistData: any };
  /**
   * PHASE 1: PREPARE
   * Pure logic with no side effects.
   *
   * @returns Prepared data including:
   *  - earlyReturn: Result if no authorization needed (e.g., already cached)
   *  - displayData: Information to show in authorization dialog
   *  - executionData: Data needed to perform the action
   *  - persistence: Optional configuration for persistent authorization caching
   */
  abstract prepare(...args: TArgs): Promise<{
    earlyReturn?: TResult;
    displayData?: Record<string, unknown>;
    executionData?: TExecutionData;
    persistence?: {
      storageKey: string;
      persistData: any;
    };
  }>;

  /**
   * PHASE 2A: CREATE INTERACTION (Standalone only)
   * Create the interaction object for tracking this operation.
   * Operations should use their injected interaction manager from constructor.
   *
   * @param displayData - Data to show in interaction
   * @returns The created interaction
   */
  abstract createInteraction(
    displayData: Record<string, unknown>
  ): Promise<WalletInteraction<WalletInteractionType>>;

  /**
   * PHASE 2B: REQUEST AUTHORIZATION (Standalone only)
   * Request user permission for this operation.
   * Operations should use their injected authorization manager from constructor.
   * Uses currentInteraction to update status and persistenceConfig for caching.
   *
   * @param displayData - Data to show in authorization dialog
   * @returns Promise that resolves when authorization is granted or rejects if denied
   */
  abstract requestAuthorization(
    displayData: Record<string, unknown>
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
    this.currentInteraction = interaction;
  }

  /**
   * Emit a progress update for the current interaction.
   * Safe to call from execute() - updates the tracked interaction if one is set.
   *
   * @param status - The status message to display
   * @param description - Optional additional description
   */
  protected async emitProgress(
    status: string,
    description?: string
  ): Promise<void> {
    if (this.currentInteraction) {
      await this.interactionManager.storeAndEmit(
        this.currentInteraction.update({ status, description })
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

    // Store persistence config in operation instance
    this.persistenceConfig = prepared.persistence;

    // PHASE 2A: CREATE INTERACTION
    const interaction = await this.createInteraction(prepared.displayData!);

    // PHASE 2B: REQUEST AUTHORIZATION
    this.setCurrentInteraction(interaction);
    try {
      await this.requestAuthorization(prepared.displayData!);
    } catch (error) {
      this.setCurrentInteraction(undefined);
      this.persistenceConfig = undefined;
      throw error;
    }

    // PHASE 3: EXECUTE - Perform the action with interaction tracking
    try {
      const result = await this.execute(prepared.executionData!);
      await this.updateInteractionSuccess(interaction);
      return result;
    } catch (error) {
      await this.updateInteractionFailure(interaction, error);
      throw error;
    } finally {
      this.setCurrentInteraction(undefined);
      this.persistenceConfig = undefined;
    }
  }
}
