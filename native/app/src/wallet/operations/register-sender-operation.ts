import {
  ExternalOperation,
  type PrepareResult,
  type PersistenceConfig,
} from "./base-operation";
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
  RegisterSenderExecutionData,
  RegisterSenderDisplayData
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

  async check(
    _address: AztecAddress,
    _alias: string
  ): Promise<RegisterSenderResult | undefined> {
    // No early return checks for this operation
    return undefined;
  }

  async createInteraction(
    address: AztecAddress,
    _alias: string
  ): Promise<WalletInteraction<WalletInteractionType>> {
    // Create interaction with simple title from args only
    const interaction = WalletInteraction.from({
      type: "registerSender",
      status: "PREPARING",
      complete: false,
      title: "Register Sender",
      description: `Address: ${address.toString()}`,
    });

    await this.interactionManager.storeAndEmit(interaction);

    return interaction;
  }

  async prepare(
    address: AztecAddress,
    alias: string
  ): Promise<
    PrepareResult<
      RegisterSenderResult,
      RegisterSenderDisplayData,
      RegisterSenderExecutionData
    >
  > {
    return {
      displayData: { address, alias },
      executionData: { address, alias },
    };
  }

  async requestAuthorization(
    displayData: RegisterSenderDisplayData,
    _persistence?: PersistenceConfig
  ): Promise<void> {
    // Update interaction with detailed title and status
    await this.emitProgress("REQUESTING AUTHORIZATION", undefined, false, {
      title: `Register sender ${displayData.alias}`,
    });

    await this.authorizationManager.requestAuthorization([
      {
        id: crypto.randomUUID(),
        appId: this.authorizationManager.appId,
        method: "registerSender",
        params: {
          address: displayData.address.toString(),
          alias: displayData.alias,
        },
        timestamp: Date.now(),
      },
    ]);
  }

  async execute(
    executionData: RegisterSenderExecutionData
  ): Promise<RegisterSenderResult> {
    // Store sender in database
    await this.db.storeSender(executionData.address, executionData.alias);

    // Register with PXE
    const result = await this.pxe.registerSender(executionData.address);

    await this.emitProgress("SUCCESS", undefined, true);
    return result;
  }
}
