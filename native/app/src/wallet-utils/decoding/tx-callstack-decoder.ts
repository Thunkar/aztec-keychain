import type {
  TxSimulationResult,
  PrivateCallExecutionResult,
  TxExecutionRequest,
} from "@aztec/stdlib/tx";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import {
  getFunctionArtifact,
  type AbiDecoded,
  FunctionSelector,
  getAllFunctionAbis,
  type FunctionAbi,
} from "@aztec/stdlib/abi";
import { decodeFromAbi } from "@aztec/aztec.js";
import { formatAbiValue } from "./utils";
import type { TxDecodingCache } from "./tx-decoding-cache";
import { Fr } from "@aztec/foundation/fields";
import {
  PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH,
  PRIVATE_CONTEXT_INPUTS_LENGTH,
} from "@aztec/constants";

export type ExecutionEvent = PrivateCallEvent | PublicEnqueueEvent;

export interface PrivateCallEvent {
  type: "private-call";
  depth: number;
  counter: { start: number; end: number };
  contract: { name: string; address: string };
  function: string;
  caller: { name: string; address: string };
  isStaticCall: boolean;
  args: Array<{ name: string; value: string }>;
  returnValues: Array<{ name: string; value: string }>;
  nestedEvents: ExecutionEvent[];
}

export interface PublicEnqueueEvent {
  type: "public-enqueue";
  depth: number;
  counter: number;
  contract: { name: string; address: string };
  function: string;
  caller: { name: string; address: string };
  isStaticCall: boolean;
  args: Array<{ name: string; value: string }>;
}

export interface DecodedExecutionTrace {
  privateExecution: PrivateCallEvent;
  publicExecutionQueue: PublicEnqueueEvent[];
}

export class TxCallStackDecoder {
  private calldataMap: Map<string, any[]> = new Map();
  private argsOfCallsMap: Map<string, any[]> = new Map();

  constructor(private cache: TxDecodingCache) {}

  private async formatAndResolveValue(value: AbiDecoded): Promise<string> {
    let formatted = formatAbiValue(value);

    // Try to resolve addresses
    if (value && typeof value === "object" && "toString" in value) {
      const valueStr = value.toString();
      if (valueStr.startsWith("0x") && valueStr.length === 66) {
        try {
          const addr = AztecAddress.fromString(valueStr);
          const alias = await this.cache.getAddressAlias(addr);
          formatted = `${alias} (${formatted.slice(0, 10)}...${formatted.slice(-8)})`;
        } catch {
          // Not a valid address, use original formatted value
        }
      }
    }

    return formatted;
  }

  /**
   * Extract and decode function arguments from the partial witness.
   * The witness layout is: [arguments (0 to parametersSize-1), context, returnData, ...]
   */
  private extractArgsFromWitness(
    partialWitness: Map<number, string>,
    functionAbi: FunctionAbi
  ): any[] {
    console.log(
      `[Decoder] Extracting args from witness for ${functionAbi.parameters.length} parameters`
    );

    try {
      // Calculate the total size of parameters
      let parametersSize = 0;
      for (const param of functionAbi.parameters) {
        parametersSize += this.getTypeSize(param.type);
      }

      console.log(
        `[Decoder] Total parameters size: ${parametersSize} field elements`
      );

      // Extract the argument fields from witness (indices PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH to PRIVATE_CIRCUIT_PUBLIC_INPUTS_LENGTH+parametersSize-1)
      const argsFields: Fr[] = [];
      for (
        let i = PRIVATE_CONTEXT_INPUTS_LENGTH;
        i < parametersSize + PRIVATE_CONTEXT_INPUTS_LENGTH;
        i++
      ) {
        const witnessValue = partialWitness.get(i);
        if (witnessValue !== undefined) {
          argsFields.push(Fr.fromString(witnessValue));
        } else {
          console.warn(`[Decoder] Missing witness value at index ${i}`);
        }
      }

      console.log(
        `[Decoder] Extracted ${argsFields.length} field elements from witness:`,
        argsFields.map((f) => f.toString().slice(0, 20) + "...")
      );

      return argsFields;
    } catch (error) {
      console.error(`[Decoder] Failed to extract args from witness:`, error);
      throw error;
    }
  }

  /**
   * Calculate the field size of an ABI type (how many field elements it occupies).
   * This mirrors ArgumentEncoder.typeSize from aztec-packages.
   */
  private getTypeSize(abiType: any): number {
    switch (abiType.kind) {
      case "field":
      case "boolean":
      case "integer":
        return 1;
      case "string":
        return abiType.length;
      case "array":
        return abiType.length * this.getTypeSize(abiType.type);
      case "struct":
        return abiType.fields.reduce((acc: number, field: any) => {
          return acc + this.getTypeSize(field.type);
        }, 0);
      default:
        throw new Error(`Unsupported type kind: ${abiType.kind}`);
    }
  }

  private async decodePrivateCall(
    call: PrivateCallExecutionResult,
    depth: number,
    parentPublicEnqueues: Array<{ counter: number; request: any }>
  ): Promise<PrivateCallEvent> {
    const callContext = call.publicInputs.callContext;
    const startCounter = call.publicInputs.startSideEffectCounter.toNumber();
    const endCounter = call.publicInputs.endSideEffectCounter.toNumber();

    // Debug: Log nested execution info
    console.log(
      `[Decoder] Processing call at depth ${depth}, counter ${startCounter}-${endCounter}, ` +
        `nestedExecutionResults: ${call.nestedExecutionResults?.length || 0}`
    );

    // Get contract and function names
    const contractName = await this.cache.getAddressAlias(
      callContext.contractAddress
    );
    const callerName = await this.cache.getAddressAlias(callContext.msgSender);

    let functionName = `0x${callContext.functionSelector.toString().slice(2, 10)}`;
    let args: Array<{ name: string; value: string }> = [];
    let returnValues: Array<{ name: string; value: string }> = [];

    try {
      const metadata = await this.cache.getContractMetadata(
        callContext.contractAddress
      );
      if (metadata.contractInstance) {
        const artifact = await this.cache.getContractArtifact(
          metadata.contractInstance.currentContractClassId
        );
        const functionAbi = await getFunctionArtifact(
          artifact,
          callContext.functionSelector
        );
        functionName = functionAbi.name;

        // Decode arguments from argsHash (first try argsOfCalls map)
        const argsHash = call.publicInputs.argsHash.toString();
        let argsValues = this.argsOfCallsMap.get(argsHash);

        console.log(
          `[Decoder] Function: ${functionName}, depth: ${depth}, argsHash: ${argsHash.slice(0, 20)}..., ` +
            `has args in map: ${!!argsValues}, params count: ${functionAbi.parameters.length}`
        );

        // If not in argsOfCalls map, try extracting from partialWitness
        if (
          !argsValues &&
          functionAbi.parameters.length > 0 &&
          call.partialWitness
        ) {
          console.log(
            `[Decoder] Attempting to extract args from partialWitness for ${functionName}`
          );
          try {
            argsValues = this.extractArgsFromWitness(
              call.partialWitness,
              functionAbi
            );
            console.log(
              `[Decoder] Successfully extracted ${argsValues.length} args from witness`
            );
          } catch (error) {
            console.warn(
              `[Decoder] Failed to extract args from witness for ${functionName}:`,
              error
            );
          }
        }

        if (argsValues && functionAbi.parameters.length > 0) {
          try {
            console.log(
              `[Decoder] Decoding ${argsValues.length} field values with types: ` +
                `${functionAbi.parameters.map((p: any) => `${p.name}:${JSON.stringify(p.type)}`).join(", ")}`
            );

            const decoded = decodeFromAbi(
              functionAbi.parameters.map((p) => p.type),
              argsValues
            );

            console.log(
              `[Decoder] decodeFromAbi returned:`,
              typeof decoded,
              Array.isArray(decoded)
            );

            // decodeFromAbi returns a single value if there's one param, or an array for multiple
            const decodedArgs = Array.isArray(decoded) ? decoded : [decoded];

            console.log(
              `[Decoder] After array normalization: ${decodedArgs.length} values`
            );

            args = await Promise.all(
              decodedArgs.map(async (value, i) => {
                const formatted = await this.formatAndResolveValue(value);
                console.log(
                  `[Decoder] Arg ${i} (${functionAbi.parameters[i]?.name}): ` +
                    `decoded type=${typeof value}, formatted="${formatted.slice(0, 50)}${formatted.length > 50 ? "..." : ""}"`
                );
                return {
                  name: functionAbi.parameters[i]?.name || `arg_${i}`,
                  value: formatted,
                };
              })
            );
          } catch (error) {
            console.warn(
              `Failed to decode arguments for ${functionName}:`,
              error
            );
            // Fall back to showing raw values
            args = argsValues.map((val, i) => ({
              name: functionAbi.parameters[i]?.name || `arg_${i}`,
              value: val.toString(),
            }));
          }
        } else if (!argsValues && functionAbi.parameters.length > 0) {
          console.warn(
            `[Decoder] Could not retrieve args for ${functionName} at depth ${depth}. ` +
              `argsHash: ${argsHash}, available hashes: ${Array.from(
                this.argsOfCallsMap.keys()
              )
                .map((k) => k.slice(0, 20))
                .join(", ")}`
          );
        }

        // Decode return values
        if (functionAbi.returnTypes.length > 0) {
          const decodedReturns = decodeFromAbi(
            functionAbi.returnTypes,
            call.returnValues
          ) as AbiDecoded[];

          returnValues = await Promise.all(
            decodedReturns.map(async (value, i) => ({
              name: `return_${i}`,
              value: await this.formatAndResolveValue(value),
            }))
          );
        }
      }
    } catch (error) {
      // If we can't decode, use raw values
      returnValues = await Promise.all(
        call.returnValues.map(async (rv, i) => ({
          name: `return_${i}`,
          value: rv.toString(),
        }))
      );
    }

    // Get public enqueues from this specific call's publicInputs
    const thisCallPublicEnqueues = call.publicInputs.publicCallRequests
      .getActiveItems()
      .map((countedReq) => ({
        counter: countedReq.counter,
        request: countedReq.inner,
      }));

    // Combine with parent's public enqueues for proper ordering
    const allPublicEnqueues = [
      ...parentPublicEnqueues,
      ...thisCallPublicEnqueues,
    ].sort((a, b) => a.counter - b.counter);

    // Build nested events with interleaved public enqueues
    const nestedEvents: ExecutionEvent[] = [];

    // Track which public enqueues have been added
    const addedEnqueues = new Set<number>();

    // Process nested calls
    if (call.nestedExecutionResults && call.nestedExecutionResults.length > 0) {
      for (let i = 0; i < call.nestedExecutionResults.length; i++) {
        const nestedCall = call.nestedExecutionResults[i];
        const nestedStartCounter =
          nestedCall.publicInputs.startSideEffectCounter.toNumber();

        // Add public enqueues that happened before this nested call starts
        const enqueuedBefore = allPublicEnqueues.filter(
          (e) =>
            e.counter >= startCounter &&
            e.counter < nestedStartCounter &&
            !addedEnqueues.has(e.counter)
        );

        for (const enq of enqueuedBefore) {
          const event = await this.decodePublicEnqueue(
            enq.request,
            depth + 1,
            enq.counter
          );
          nestedEvents.push(event);
          addedEnqueues.add(enq.counter);
        }

        // Recursively decode nested call
        const nestedEvent = await this.decodePrivateCall(
          nestedCall,
          depth + 1,
          allPublicEnqueues
        );
        nestedEvents.push(nestedEvent);
      }
    }

    // Add any remaining public enqueues after all nested calls
    const enqueuedAfter = allPublicEnqueues.filter(
      (e) =>
        e.counter >= startCounter &&
        e.counter < endCounter &&
        !addedEnqueues.has(e.counter)
    );

    for (const enq of enqueuedAfter) {
      const event = await this.decodePublicEnqueue(
        enq.request,
        depth + 1,
        enq.counter
      );
      nestedEvents.push(event);
      addedEnqueues.add(enq.counter);
    }

    return {
      type: "private-call",
      depth,
      counter: { start: startCounter, end: endCounter },
      contract: {
        name: contractName,
        address: callContext.contractAddress.toString(),
      },
      function: functionName,
      caller: {
        name: callerName,
        address: callContext.msgSender.toString(),
      },
      isStaticCall: callContext.isStaticCall,
      args,
      returnValues,
      nestedEvents,
    };
  }

  private async decodePublicEnqueue(
    request: any,
    depth: number,
    counter: number
  ): Promise<PublicEnqueueEvent> {
    const contractName = await this.cache.getAddressAlias(
      request.contractAddress
    );
    const callerName = await this.cache.getAddressAlias(request.msgSender);

    // Get calldata using the calldataHash
    let functionName = "public_function";
    let args: Array<{ name: string; value: string }> = [];
    const calldataHashStr = request.calldataHash.toString();
    const calldata = this.calldataMap.get(calldataHashStr);

    if (calldata && calldata.length > 0) {
      try {
        // First element of calldata is the function selector
        const functionSelector = FunctionSelector.fromField(calldata[0]);

        // Try to resolve function name and decode arguments from contract ABI
        try {
          const metadata = await this.cache.getContractMetadata(
            request.contractAddress
          );
          if (metadata.contractInstance) {
            const artifact = await this.cache.getContractArtifact(
              metadata.contractInstance.currentContractClassId
            );
            const allAbis = await getAllFunctionAbis(artifact);
            const abisWithSelector = await Promise.all(
              allAbis.map(async (abi) => ({
                ...abi,
                selector: await FunctionSelector.fromNameAndParameters(
                  abi.name,
                  abi.parameters
                ),
              }))
            );
            const functionAbi = abisWithSelector.find((abi) =>
              abi.selector.equals(functionSelector)
            );

            if (functionAbi) {
              functionName = functionAbi.name;

              // Decode arguments - calldata is [selector, ...args]
              if (functionAbi.parameters.length > 0 && calldata.length > 1) {
                try {
                  const argsData = calldata.slice(1); // Skip the selector
                  const decoded = decodeFromAbi(
                    functionAbi.parameters.map((p) => p.type),
                    argsData
                  );

                  // decodeFromAbi returns a single value if there's one param, or an array for multiple
                  const decodedArgs = Array.isArray(decoded)
                    ? decoded
                    : [decoded];

                  args = await Promise.all(
                    decodedArgs.map(async (value, i) => ({
                      name: functionAbi.parameters[i]?.name || `arg_${i}`,
                      value: await this.formatAndResolveValue(value),
                    }))
                  );
                } catch (error) {
                  console.warn(
                    `Failed to decode public function arguments for ${functionName}:`,
                    error
                  );
                  // Fall back to showing raw values
                  args = calldata.slice(1).map((val, i) => ({
                    name: functionAbi.parameters[i]?.name || `arg_${i}`,
                    value: val.toString(),
                  }));
                }
              }
            }
          }
        } catch {
          // If we can't resolve from ABI, use the selector hex
          functionName = `0x${functionSelector.toString().slice(2, 10)}`;
        }
      } catch (error) {
        console.warn(
          `Failed to decode function selector for public call:`,
          error
        );
      }
    }

    return {
      type: "public-enqueue",
      depth,
      counter,
      contract: {
        name: contractName,
        address: request.contractAddress.toString(),
      },
      function: functionName,
      caller: {
        name: callerName,
        address: request.msgSender.toString(),
      },
      isStaticCall: request.isStaticCall,
      args,
    };
  }

  async decodeSimulationResult(
    simulationResult: TxSimulationResult,
    txRequest?: TxExecutionRequest
  ): Promise<DecodedExecutionTrace> {
    // Build calldata map from publicFunctionCalldata
    this.calldataMap.clear();
    if (simulationResult.privateExecutionResult.publicFunctionCalldata) {
      for (const hashedCalldata of simulationResult.privateExecutionResult
        .publicFunctionCalldata) {
        this.calldataMap.set(
          hashedCalldata.hash.toString(),
          hashedCalldata.values
        );
      }
    }

    // Build args map from TxExecutionRequest if provided
    this.argsOfCallsMap.clear();
    if (txRequest?.argsOfCalls) {
      console.log(
        `[Decoder] Building args map with ${txRequest.argsOfCalls.length} entries from TxExecutionRequest`
      );
      for (const hashedArgs of txRequest.argsOfCalls) {
        const hashStr = hashedArgs.hash.toString();
        this.argsOfCallsMap.set(hashStr, hashedArgs.values);
        console.log(
          `[Decoder] Added args entry: hash=${hashStr.slice(0, 20)}..., ` +
            `values count=${hashedArgs.values.length}`
        );
      }
    } else {
      console.warn("[Decoder] No txRequest.argsOfCalls provided");
    }

    const entrypoint = simulationResult.privateExecutionResult.entrypoint;

    // Decode the private execution tree
    const privateExecution = await this.decodePrivateCall(entrypoint, 0, []);

    // Collect all public enqueues in execution order (by counter)
    const allPublicEnqueues: PublicEnqueueEvent[] = [];

    const collectPublicEnqueues = (event: ExecutionEvent) => {
      if (event.type === "public-enqueue") {
        allPublicEnqueues.push(event);
      } else if (event.type === "private-call") {
        event.nestedEvents.forEach(collectPublicEnqueues);
      }
    };

    collectPublicEnqueues(privateExecution);

    // Sort by counter to show execution order
    allPublicEnqueues.sort((a, b) => a.counter - b.counter);

    return {
      privateExecution,
      publicExecutionQueue: allPublicEnqueues,
    };
  }
}
