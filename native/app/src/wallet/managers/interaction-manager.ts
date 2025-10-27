import type { WalletInteraction, WalletInteractionType } from "../types/wallet-interaction";
import { WalletUpdateEvent } from "../types/wallet-interaction";
import type { WalletDB } from "../database/wallet-db";

/**
 * Manages wallet interactions - storing them in the database and emitting events.
 *
 * This manager encapsulates the logic for persisting interactions and notifying
 * listeners, providing a clean interface for operations to update their state.
 *
 * Implements EventTarget to allow direct event subscription.
 */
export class InteractionManager implements EventTarget {
  private eventEmitter = new EventTarget();

  constructor(private db: WalletDB) {}

  /**
   * Store an interaction in the database and emit an update event.
   *
   * @param interaction - The interaction to store and emit
   */
  async storeAndEmit(interaction: WalletInteraction<WalletInteractionType>): Promise<void> {
    await this.db.createOrUpdateInteraction(interaction);
    this.eventEmitter.dispatchEvent(new WalletUpdateEvent(interaction));
  }

  // EventTarget implementation - delegate to internal eventEmitter
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
    this.eventEmitter.addEventListener(type, listener, options);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void {
    this.eventEmitter.removeEventListener(type, listener, options);
  }

  dispatchEvent(event: Event): boolean {
    return this.eventEmitter.dispatchEvent(event);
  }
}
