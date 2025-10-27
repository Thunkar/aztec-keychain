import { ExternalOperation } from "./base-operation";
import type { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { PXE } from "@aztec/pxe/server";
import {
  WalletInteraction,
  type WalletInteractionType,
} from "../types/wallet-interaction";
import type { WalletDB } from "../database/wallet-db";
import type { InteractionManager } from "../managers/interaction-manager";
import type { AuthorizationManager } from "../managers/authorization-manager";

// Arguments tuple for the operation
type RegisterSenderArgs = [address: AztecAddress, alias: string];

// Result type for the operation
type RegisterSenderResult = AztecAddress;

// Execution data stored between prepare and execute phases
interface RegisterSenderExecutionData {
  address: AztecAddress;
  alias: string;
}

// Display data for authorization UI
type RegisterSenderDisplayData = {
  address: AztecAddress;
  alias: string;
};

/**
 * RegisterSender operation implementation.
 *
 * Handles sender registration with the following features:
 * - Stores sender alias in database
 * - Registers sender with PXE
 * - Creates interaction for tracking
 */
export class RegisterSenderOperation extends ExternalOperation<
  RegisterSenderArgs,
  RegisterSenderResult,
  RegisterSenderExecutionData
> {
  protected interactionManager: InteractionManager;

  constructor(
    private pxe: PXE,
    private db: WalletDB,
    interactionManager: InteractionManager,
    private authorizationManager: AuthorizationManager
  ) {
    super();
    this.interactionManager = interactionManager;
  }

  async prepare(
    address: AztecAddress,
    alias: string
  ): Promise<{
    earlyReturn?: RegisterSenderResult;
    displayData?: RegisterSenderDisplayData;
    executionData?: RegisterSenderExecutionData;
  }> {
    // No early return case for registerSender - always needs authorization
    return {
      displayData: { address, alias },
      executionData: { address, alias },
    };
  }

  async createInteraction(
    displayData: RegisterSenderDisplayData
  ): Promise<WalletInteraction<WalletInteractionType>> {
    const interaction = WalletInteraction.from({
      type: "registerSender",
      status: "REGISTERING",
      complete: false,
      title: `Register sender ${displayData.alias}`,
    });

    await this.interactionManager.storeAndEmit(interaction);

    return interaction;
  }

  async requestAuthorization(
    displayData: RegisterSenderDisplayData,
    _interaction: WalletInteraction<WalletInteractionType>
  ): Promise<void> {
    await this.authorizationManager.requestAuthorization("registerSender", {
      address: displayData.address.toString(),
      alias: displayData.alias,
    });
  }

  async execute(
    executionData: RegisterSenderExecutionData
  ): Promise<RegisterSenderResult> {
    // Store sender in database
    await this.db.storeSender(executionData.address, executionData.alias);

    // Register with PXE
    return await this.pxe.registerSender(executionData.address);
  }

  getSuccessStatus(): string {
    return "REGISTERED";
  }

  getFailureStatus(): string {
    return "REGISTRATION FAILED";
  }
}
