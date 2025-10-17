import type { PXE } from "@aztec/pxe/server";
import type { WalletDB } from "../wallet_db";
import type { TxSimulationResult, TxExecutionRequest } from "@aztec/stdlib/tx";
import { TxDecodingCache } from "./tx-decoding-cache";
import {
  CallAuthorizationFormatter,
  type ReadableCallAuthorization,
} from "./call-authorization-formatter";
import {
  TxCallStackDecoder,
  type DecodedExecutionTrace,
} from "./tx-callstack-decoder";
import { collectOffchainEffects } from "@aztec/stdlib/tx";

/**
 * High-level service for decoding transaction information.
 * Coordinates CallAuthorizationFormatter and TxCallStackDecoder with shared caching.
 */
export class TxDecodingService {
  private cache: TxDecodingCache;
  private formatter: CallAuthorizationFormatter;
  private decoder: TxCallStackDecoder;

  constructor(pxe: PXE, db: WalletDB) {
    this.cache = new TxDecodingCache(pxe, db);
    this.formatter = new CallAuthorizationFormatter(this.cache);
    this.decoder = new TxCallStackDecoder(this.cache);
  }

  /**
   * Decode transaction information including call authorizations and execution trace.
   */
  async decodeTransaction(
    simulationResult: TxSimulationResult,
    txRequest?: TxExecutionRequest
  ): Promise<{
    callAuthorizations: ReadableCallAuthorization[];
    executionTrace: DecodedExecutionTrace;
  }> {
    const offChainEffects = collectOffchainEffects(
      simulationResult.privateExecutionResult
    );

    // Parse call authorizations from offchain effects
    const callAuthorizations = await Promise.all(
      offChainEffects.map((effect) =>
        this.formatter.parseCallAuthorizationFromEffect(effect)
      )
    );

    const filteredCallAuthorizations = callAuthorizations.filter(Boolean);

    // Format for display
    const readableCallAuthorizations =
      await this.formatter.formatCallAuthorizationsForDisplay(
        filteredCallAuthorizations
      );

    // Decode execution call stack
    const executionTrace =
      await this.decoder.decodeSimulationResult(simulationResult, txRequest);

    return {
      callAuthorizations: readableCallAuthorizations,
      executionTrace,
    };
  }

  /**
   * Clear all cached contract metadata and artifacts.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
