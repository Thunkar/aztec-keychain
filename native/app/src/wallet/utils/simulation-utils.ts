import { AztecAddress } from "@aztec/stdlib/aztec-address";
import { ExecutionPayload } from "@aztec/entrypoints/payload";
import { sha256 } from "@aztec/foundation/crypto";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import { serializeToBuffer } from "@aztec/foundation/serialize";
import { FunctionType } from "@aztec/stdlib/abi";
import type { DecodingCache } from "../decoding/decoding-cache";

/**
 * Creates a deterministic hash of an execution payload for comparison.
 * This is used to determine if a simulation authorization can be reused.
 */
export function hashExecutionPayload(payload: ExecutionPayload): string {
  // Serialize using serializeToBuffer for consistent binary representation
  // We include calls, capsules, and extraHashedArgs
  // We exclude authWitnesses as they're transient and don't affect the simulation itself
  const buffers: Buffer[] = [];

  // Serialize calls - each call includes to, selector, and args
  for (const call of payload.calls) {
    buffers.push(
      serializeToBuffer(
        call.to,
        call.selector,
        call.type,
        call.hideMsgSender,
        call.isStatic,
        call.args.length,
        ...call.args
      )
    );
  }

  // Serialize capsules
  for (const capsule of payload.capsules) {
    buffers.push(capsule.toBuffer());
  }

  // Serialize extra hashed args
  for (const hashedValue of payload.extraHashedArgs) {
    buffers.push(hashedValue.toBuffer());
  }

  const concatenated = Buffer.concat(buffers);
  const hash = sha256(concatenated);
  return hash.toString("hex");
}

/**
 * Creates a deterministic hash of a utility function call for comparison.
 * This is used to determine if a utility simulation authorization can be reused.
 */
export function hashUtilityCall(
  functionName: string,
  args: any[],
  to: AztecAddress,
  from?: AztecAddress
): string {
  const callData = {
    functionName,
    args,
    to: to.toString(),
    from: from?.toString(),
  };

  const serialized = jsonStringify(callData);
  return sha256(Buffer.from(serialized)).toString("hex");
}

/**
 * Generates a meaningful title for a transaction simulation based on the execution payload.
 * Filters out wallet-added calls (account entrypoint, fee payment) to show only user-initiated calls.
 * Handles both private and public function calls.
 */
export async function generateSimulationTitle(
  executionPayload: ExecutionPayload,
  cache: DecodingCache,
  fromAccount: AztecAddress,
  userFeePaymentMethod?: AztecAddress
): Promise<string> {
  // Filter out wallet-added calls:
  // 1. Account entrypoint call (call to the account contract itself)
  // 2. Fee payment method calls (unless user explicitly provided one)
  const userCalls = executionPayload.calls.filter((call) => {
    // Always exclude the account entrypoint (call to the from address)
    if (call.to.equals(fromAccount)) {
      return false;
    }

    // If user didn't provide a fee payment method, exclude any fee payment calls
    // We identify these by checking common fee payment contract names
    if (!userFeePaymentMethod) {
      const callName = call.name?.toLowerCase() || "";
      if (
        callName.includes("fee") ||
        callName.includes("payment") ||
        callName === "prepare_fee"
      ) {
        return false;
      }
    }

    return true;
  });

  if (userCalls.length === 0) {
    return "Transaction";
  }

  // Try to get contract names for the calls using the decoding cache
  const callDescriptions: string[] = [];

  for (const call of userCalls.slice(0, 3)) {
    // Show up to 3 calls
    try {
      // Use the decoding cache to resolve contract name - this will check:
      // 1. Registered contracts with artifacts
      // 2. Manually added contacts/senders
      // 3. Falls back to shortened address
      const contractName = await cache.getAddressAlias(call.to);
      const functionName = call.name || "fn";

      // Add function type indicator for clarity
      let typeIndicator = "";
      if (call.type === FunctionType.PUBLIC) {
        typeIndicator = "[pub]";
      } else if (call.type === FunctionType.UTILITY) {
        typeIndicator = "[util]";
      }
      // Private functions don't need an indicator (they're the default)

      const desc = typeIndicator
        ? `${contractName}::${functionName} ${typeIndicator}`
        : `${contractName}::${functionName}`;

      callDescriptions.push(desc);
    } catch {
      const contractName = call.to.toString().substring(0, 10) + "...";
      const functionName = call.name || "fn";
      callDescriptions.push(`${contractName}::${functionName}`);
    }
  }

  if (userCalls.length > 3) {
    callDescriptions.push(`+${userCalls.length - 3} more`);
  }

  return callDescriptions.join(", ");
}
