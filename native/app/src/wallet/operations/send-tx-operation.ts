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
import type { SendOptions } from "@aztec/aztec.js/wallet";
import type { SimulateTxOperation } from "./simulate-tx-operation";

type ReadableTxInformation = {
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
  [
    executionPayload: ExecutionPayload,
    opts: SendOptions,
    txInformation?: ReadableTxInformation,
  ],
  TxHash,
  {
    exec: ExecutionPayload;
    from: AztecAddress;
    txRequest: TxExecutionRequest;
    callAuthorizations: ReadableCallAuthorization[];
    executionTrace?: DecodedExecutionTrace;
    needsAuthorization: boolean;
  }
> {
  constructor(
    private pxe: PXE,
    private aztecNode: AztecNode,
    private db: WalletDB,
    private decodingCache: DecodingCache,
    private interactionManager: InteractionManager,
    private authorizationManager: AuthorizationManager,
    private simulateTxOp: SimulateTxOperation,
    private createAuthWit: (
      from: AztecAddress,
      auth: { caller: AztecAddress; call: any }
    ) => Promise<any>,
    private createTxExecutionRequestFromPayloadAndFee: (
      exec: ExecutionPayload,
      from: AztecAddress,
      fee: any
    ) => Promise<TxExecutionRequest>,
    private getDefaultFeeOptions: (
      from: AztecAddress,
      fee: any
    ) => Promise<any>,
    private contextualizeError: (err: any, context: string) => Error
  ) {
    super();
  }

  async prepare(
    executionPayload: ExecutionPayload,
    opts: SendOptions,
    txInformation?: ReadableTxInformation
  ): Promise<{
    earlyReturn?: TxHash;
    displayData?: {
      payloadHash: string;
      title: string;
      callAuthorizations: ReadableCallAuthorization[];
      executionTrace?: DecodedExecutionTrace;
    };
    executionData?: {
      exec: ExecutionPayload;
      from: AztecAddress;
      txRequest: TxExecutionRequest;
      callAuthorizations: ReadableCallAuthorization[];
      executionTrace?: DecodedExecutionTrace;
      needsAuthorization: boolean;
    };
  }> {
    const fee = await this.getDefaultFeeOptions(opts.from, opts.fee);

    let callAuthorizations: ReadableCallAuthorization[];
    let executionTrace: DecodedExecutionTrace | undefined;

    if (!txInformation) {
      // Use simulateTx operation's prepare method
      const interaction = WalletInteraction.from({
        id: hashExecutionPayload(executionPayload),
        type: "sendTx",
        status: "COMPUTING AUTHORIZATIONS",
        complete: false,
        title: await generateSimulationTitle(
          executionPayload,
          this.decodingCache,
          opts.from,
          opts.fee?.embeddedPaymentMethodFeePayer
        ),
      });

      const prepared = await this.simulateTxOp.prepare(
        executionPayload,
        opts,
        interaction
      );

      // Decode if not already done (prepare skips decoding for existing interactions)
      let decoded = prepared.executionData!.decoded;
      if (!decoded) {
        const decodingService = new TxDecodingService(this.decodingCache);
        decoded = await decodingService.decodeTransaction(
          prepared.executionData!.simulationResult
        );
      }

      ({ callAuthorizations, executionTrace } = decoded);

      // Store simulation result
      await this.db.storeTxSimulation(
        prepared.executionData!.payloadHash,
        prepared.executionData!.simulationResult,
        prepared.executionData!.txRequest
      );
    } else {
      callAuthorizations = txInformation.callAuthorizations;
      executionTrace = txInformation.executionTrace;
    }

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
        exec: executionPayload,
        from: opts.from,
        txRequest,
        callAuthorizations,
        executionTrace,
        needsAuthorization: !txInformation,
      },
    };
  }

  async authorize(displayData: {
    payloadHash: string;
    title: string;
    callAuthorizations: ReadableCallAuthorization[];
    executionTrace?: DecodedExecutionTrace;
  }): Promise<{ interaction: WalletInteraction<WalletInteractionType> }> {
    const interaction = WalletInteraction.from({
      id: displayData.payloadHash,
      type: "sendTx",
      title: displayData.title,
      complete: false,
      status: "REQUESTING AUTHORIZATION",
      timestamp: Date.now(),
    });

    await this.interactionManager.storeAndEmit(interaction);

    // Request authorization
    await this.authorizationManager.requestAuthorization(
      "sendTx",
      {
        callAuthorizations: displayData.callAuthorizations,
        executionTrace: displayData.executionTrace,
      },
      { persist: false }
    );

    return { interaction };
  }

  async execute(executionData: {
    exec: ExecutionPayload;
    from: AztecAddress;
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

  createBatchInteraction(displayData: {
    payloadHash: string;
    title: string;
    callAuthorizations: ReadableCallAuthorization[];
    executionTrace?: DecodedExecutionTrace;
  }): WalletInteraction<WalletInteractionType> {
    const interaction = WalletInteraction.from({
      id: displayData.payloadHash,
      type: "sendTx",
      title: displayData.title,
      complete: false,
      status: "CREATING",
      timestamp: Date.now(),
    });

    this.interactionManager.storeAndEmit(interaction);

    return interaction;
  }

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

  getSuccessStatus(): string {
    return "SENT";
  }

  getFailureStatus(): string {
    return "SENDING FAILED";
  }
}
