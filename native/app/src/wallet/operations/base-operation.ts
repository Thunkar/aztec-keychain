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
 * @template TResult - The final result type of the operation (unused but kept for backwards compatibility)
 * @template TDisplayData - The display data type for the UI
 * @template TExecutionData - The execution data type for the execute phase
 */
export interface PrepareResult<TResult, TDisplayData, TExecutionData> {
  /**
   * Data to display in the UI and authorization dialog.
   * Always complete and accurate - never fake/placeholder data.
   */
  displayData: TDisplayData;

  /**
   * Data needed for the execute phase.
   * Only set if prepare was successful and execution is needed.
   */
  executionData?: TExecutionData;

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
   * PHASE 0: CHECK
   * Runs BEFORE interaction creation to determine if an early return is possible.
   * Performs lightweight checks like:
   * - Is resource already registered?
   * - Is cached result available?
   * - Can operation be skipped?
   *
   * If this returns a value, ALL subsequent phases are bypassed (no interaction created).
   * If this returns undefined, normal flow continues: createInteraction → prepare → authorize → execute
   *
   * @param args - Operation arguments
   * @returns The early return value if operation can skip, undefined otherwise
   */
  abstract check(...args: TArgs): Promise<TResult | undefined>;

  /**
   * PHASE 1: CREATE INTERACTION
   * Create the interaction object for tracking this operation.
   * Called with raw arguments BEFORE prepare(), so cannot use prepared data.
   * Should generate a simple/generic title and description from arguments only.
   * Operations should use their injected interaction manager from constructor.
   *
   * @param args - Raw operation arguments
   * @returns The created interaction
   */
  abstract createInteraction(
    ...args: TArgs
  ): Promise<WalletInteraction<WalletInteractionType>>;

  /**
   * PHASE 2: PREPARE
   * Pure logic with no side effects.
   * Should throw errors naturally - no need to catch and return in error field.
   *
   * @param args - Arguments for the operation
   * @returns PrepareResult containing earlyReturn, displayData, executionData, and persistence config
   */
  abstract prepare(
    ...args: TArgs
  ): Promise<PrepareResult<TResult, TDisplayData, TExecutionData>>;

  /**
   * PHASE 2B: REQUEST AUTHORIZATION (Standalone only)
   * Request user permission for this operation.
   * Operations should use their injected authorization manager from constructor.
   * Can call emitProgress() to report status updates (uses this.interaction set by orchestrator).
   *
   * @param displayData - Data to show in authorization dialog
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
   * Safe to call from execute(), requestAuthorization(), or orchestrators.
   * Uses the interaction from execution context set by setCurrentInteraction().
   *
   * @param status - The status message to display
   * @param description - Optional additional description
   * @param complete - Whether the operation is complete
   * @param updates - Optional additional interaction updates (title, etc.)
   */
  async emitProgress(
    status: string,
    description?: string,
    complete?: boolean,
    updates?: Partial<{
      title: string;
      [key: string]: unknown;
    }>
  ): Promise<void> {
    if (this.interaction) {
      await this.interactionManager.storeAndEmit(
        this.interaction.update({ status, description, complete, ...updates })
      );
    }
  }

  /**
   * Standalone execution flow: check → createInteraction → prepare → requestAuthorization → execute
   * All phases wrapped in unified error handling.
   *
   * @param args - Arguments for the operation
   * @returns Result of the operation
   */
  async executeStandalone(...args: TArgs): Promise<TResult> {
    // PHASE 0: CHECK (before creating interaction)
    const earlyResult = await this.check(...args);
    if (earlyResult !== undefined) {
      // Early return - skip all other phases, no interaction created
      return earlyResult;
    }

    // PHASE 1: CREATE INTERACTION (with simple title from args)
    const interaction = await this.createInteraction(...args);
    this.setCurrentInteraction(interaction);

    try {
      // PHASE 2: PREPARE (throws on error)
      await this.emitProgress("PREPARING");
      const prepared = await this.prepare(...args);

      // PHASE 3: REQUEST AUTHORIZATION (throws on error)
      await this.requestAuthorization(
        prepared.displayData,
        prepared.persistence
      );

      // PHASE 4: EXECUTE (throws on error, should set SUCCESS state before returning)
      const result = await this.execute(prepared.executionData!);
      return result;
    } catch (error) {
      // Unified error handling for all phases
      const description = error instanceof Error ? error.message : String(error);
      await this.emitProgress("ERROR", description, true);
      throw error;
    } finally {
      this.setCurrentInteraction(undefined);
    }
  }
}
