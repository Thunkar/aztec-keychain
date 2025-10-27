import type { TxSimulationResult } from "@aztec/stdlib/tx";
import type { DecodingCache } from "./decoding-cache";
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
  private formatter: CallAuthorizationFormatter;
  private decoder: TxCallStackDecoder;

  constructor(cache: DecodingCache) {
    this.formatter = new CallAuthorizationFormatter(cache);
    this.decoder = new TxCallStackDecoder(cache);
  }

  /**
   * Decode transaction information including call authorizations and execution trace.
   * Returns fallback data if decoding fails.
   */
  async decodeTransaction(simulationResult: TxSimulationResult): Promise<{
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
      await this.decoder.decodeSimulationResult(simulationResult);

    return {
      callAuthorizations: readableCallAuthorizations,
      executionTrace,
    };
  }
}
