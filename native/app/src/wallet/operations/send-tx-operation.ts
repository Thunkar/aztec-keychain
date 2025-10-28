import { ExternalOperation } from "./base-operation";
import type { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { ExecutionPayload } from "@aztec/entrypoints/payload";
import { TxHash } from "@aztec/stdlib/tx";
import type { PXE } from "@aztec/pxe/server";
import type { TxExecutionRequest } from "@aztec/stdlib/tx";
import type { AztecNode } from "@aztec/aztec.js/node";
import { inspect } from "util";
import {
  WalletInteraction,
  type WalletInteractionType,
} from "../types/wallet-interaction";
import type { WalletDB } from "../database/wallet-db";
import type { InteractionManager } from "../managers/interaction-manager";
import type { AuthorizationManager } from "../managers/authorization-manager";
import type { DecodingCache } from "../decoding/decoding-cache";
import { TxDecodingService } from "../decoding/tx-decoding-service";
import type { ReadableCallAuthorization } from "../decoding/call-authorization-formatter";
import type { DecodedExecutionTrace } from "../decoding/tx-callstack-decoder";
import {
  hashExecutionPayload,
  generateSimulationTitle,
} from "../utils/simulation-utils";
import type {
  SendOptions,
  FeeOptions,
  UserFeeOptions,
} from "@aztec/aztec.js/wallet";
import type { SimulateTxOperation } from "./simulate-tx-operation";
import type { AuthWitness } from "@aztec/stdlib/auth-witness";

// Arguments tuple for the operation
type SendTxArgs = [executionPayload: ExecutionPayload, opts: SendOptions];

// Result type for the operation
type SendTxResult = TxHash;

// Execution data stored between prepare and execute phases
interface SendTxExecutionData {
  txRequest: TxExecutionRequest;
}

// Display data for authorization UI
type SendTxDisplayData = {
  payloadHash: string;
  title: string;
  callAuthorizations: ReadableCallAuthorization[];
  executionTrace?: DecodedExecutionTrace;
};

/**
 * SendTx operation implementation.
 *
 * Handles transaction sending with the following features:
 * - Reuses simulation from simulateTx operation
 * - Creates auth witnesses for call authorizations
 * - Parallel proving optimization (starts proving while awaiting user authorization)
 * - Transaction proving and sending
 * - Comprehensive interaction tracking with status updates
 * - Error handling with descriptive status messages
 */
export class SendTxOperation extends ExternalOperation<
  SendTxArgs,
  SendTxResult,
  SendTxExecutionData
> {
  protected interactionManager: InteractionManager;

  constructor(
    private pxe: PXE,
    private aztecNode: AztecNode,
    private db: WalletDB,
    private decodingCache: DecodingCache,
    interactionManager: InteractionManager,
    private authorizationManager: AuthorizationManager,
    private simulateTxOp: SimulateTxOperation,
    private createAuthWit: (
      from: AztecAddress,
      auth: { caller: AztecAddress; call: unknown }
    ) => Promise<AuthWitness>,
    private createTxExecutionRequestFromPayloadAndFee: (
      exec: ExecutionPayload,
      from: AztecAddress,
      fee: FeeOptions
    ) => Promise<TxExecutionRequest>,
    private getDefaultFeeOptions: (
      from: AztecAddress,
      fee: UserFeeOptions
    ) => Promise<FeeOptions>,
    private contextualizeError: (err: unknown, context: string) => Error
  ) {
    super();
    this.interactionManager = interactionManager;
  }

  async prepare(
    executionPayload: ExecutionPayload,
    opts: SendOptions
  ): Promise<{
    earlyReturn?: TxHash;
    displayData: SendTxDisplayData;
    executionData: SendTxExecutionData;
  }> {
    const fee = await this.getDefaultFeeOptions(opts.from, opts.fee);

    let callAuthorizations: ReadableCallAuthorization[];
    let executionTrace: DecodedExecutionTrace | undefined;

    // Use simulateTx operation's prepare method
    const prepared = await this.simulateTxOp.prepare(executionPayload, opts);

    // Decode if not already done (prepare skips decoding for existing interactions)
    const decoded = prepared.executionData!.decoded;

    ({ callAuthorizations, executionTrace } = decoded);

    // Store simulation result
    await this.db.storeTxSimulation(
      prepared.executionData!.payloadHash,
      prepared.executionData!.simulationResult,
      prepared.executionData!.txRequest
    );

    // Create auth witnesses for call authorizations
    const authWitnesses = await Promise.all(
      callAuthorizations.map((auth) =>
        this.createAuthWit(opts.from, {
          caller: auth.rawData.caller,
          call: auth.rawData.functionCall,
        })
      )
    );
    executionPayload.authWitnesses.push(...authWitnesses);

    // Create transaction request
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(
      executionPayload,
      opts.from,
      fee
    );

    const payloadHash = hashExecutionPayload(executionPayload);
    const title = await generateSimulationTitle(
      executionPayload,
      this.decodingCache,
      opts.from,
      opts.fee?.embeddedPaymentMethodFeePayer
    );

    return {
      displayData: {
        payloadHash,
        title,
        callAuthorizations,
        executionTrace,
      },
      executionData: {
        txRequest,
      },
    };
  }

  async createInteraction(
    displayData: SendTxDisplayData
  ): Promise<WalletInteraction<WalletInteractionType>> {
    const interaction = WalletInteraction.from({
      id: displayData.payloadHash,
      type: "sendTx",
      title: displayData.title,
      complete: false,
      status: "CREATING",
      timestamp: Date.now(),
    });

    await this.interactionManager.storeAndEmit(interaction);

    return interaction;
  }

  async requestAuthorization(
    displayData: SendTxDisplayData,
    interaction: WalletInteraction<WalletInteractionType>,
    _persistence?: { storageKey: string; persistData: any }
  ): Promise<void> {
    // Update status to requesting authorization
    await this.interactionManager.storeAndEmit(
      interaction.update({ status: "REQUESTING AUTHORIZATION" })
    );

    // Request authorization (never persisted for sendTx)
    await this.authorizationManager.requestAuthorization([
      {
        id: crypto.randomUUID(),
        appId: this.authorizationManager.appId,
        method: "sendTx",
        params: {
          callAuthorizations: displayData.callAuthorizations,
          executionTrace: displayData.executionTrace,
        },
        timestamp: Date.now(),
      },
    ]);
  }

  async execute(executionData: {
    txRequest: TxExecutionRequest;
  }): Promise<TxHash> {
    const provenTx = await this.pxe.proveTx(executionData.txRequest);

    const tx = await provenTx.toTx();
    const txHash = tx.getTxHash();

    if (await this.aztecNode.getTxEffect(txHash)) {
      throw new Error(
        `A settled tx with equal hash ${txHash.toString()} exists.`
      );
    }

    await this.aztecNode.sendTx(tx).catch((err) => {
      throw this.contextualizeError(err, inspect(tx));
    });

    return txHash;
  }

  getSuccessStatus(): string {
    return "SENT";
  }

  getFailureStatus(): string {
    return "SENDING FAILED";
  }
}
