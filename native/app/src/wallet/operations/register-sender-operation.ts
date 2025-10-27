import { ExternalOperation } from "./base-operation";
import type { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { PXE } from "@aztec/pxe/server";
import { WalletInteraction, type WalletInteractionType } from "../types/wallet-interaction";
import type { WalletDB } from "../database/wallet-db";
import type { InteractionManager } from "../managers/interaction-manager";
import type { AuthorizationManager } from "../managers/authorization-manager";

/**
 * RegisterSender operation implementation.
 *
 * Handles sender registration with the following features:
 * - Stores sender alias in database
 * - Registers sender with PXE
 * - Creates interaction for tracking
 */
export class RegisterSenderOperation extends ExternalOperation<
  [address: AztecAddress, alias: string],
  AztecAddress,
  { address: AztecAddress; alias: string }
> {
  constructor(
    private pxe: PXE,
    private db: WalletDB,
    private interactionManager: InteractionManager,
    private authorizationManager: AuthorizationManager
  ) {
    super();
  }

  async prepare(
    address: AztecAddress,
    alias: string
  ): Promise<{
    earlyReturn?: AztecAddress;
    displayData?: { address: AztecAddress; alias: string };
    executionData?: { address: AztecAddress; alias: string };
  }> {
    // No early return case for registerSender - always needs authorization
    return {
      displayData: { address, alias },
      executionData: { address, alias },
    };
  }

  async authorize(
    displayData: { address: AztecAddress; alias: string }
  ): Promise<{ interaction: WalletInteraction<WalletInteractionType> }> {
    // Create interaction
    const interaction = WalletInteraction.from({
      type: "registerSender",
      status: "REGISTERING",
      complete: false,
      title: `Register sender ${displayData.alias}`,
    });

    await this.interactionManager.storeAndEmit(interaction);

    // Request authorization
    await this.authorizationManager.request("registerSender", {
      address: displayData.address.toString(),
      alias: displayData.alias,
    });

    return { interaction };
  }

  async execute(executionData: {
    address: AztecAddress;
    alias: string;
  }): Promise<AztecAddress> {
    // Store sender in database
    await this.db.storeSender(executionData.address, executionData.alias);

    // Register with PXE
    return await this.pxe.registerSender(executionData.address);
  }

  createBatchInteraction(displayData: { address: AztecAddress; alias: string }): WalletInteraction<WalletInteractionType> {
    const interaction = WalletInteraction.from({
      type: "registerSender",
      status: "REGISTERING",
      complete: false,
      title: `Register sender ${displayData.alias}`,
    });
    // Store immediately - batch always creates interactions
    this.interactionManager.storeAndEmit(interaction);
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
    return "REGISTERED";
  }

  getFailureStatus(): string {
    return "REGISTRATION FAILED";
  }
}
