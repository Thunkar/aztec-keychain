import type {
  TxSimulationResult,
  PrivateCallExecutionResult,
} from "@aztec/stdlib/tx";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import {
  getFunctionArtifact,
  type AbiDecoded,
  FunctionSelector,
  getAllFunctionAbis,
} from "@aztec/stdlib/abi";
import { decodeFromAbi } from "@aztec/aztec.js";
import type { PXE } from "@aztec/pxe/server";
import type { WalletDB } from "../wallet_db";
import { formatAbiValue, getAddressAlias } from "./utils";
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
}

export interface DecodedExecutionTrace {
  privateExecution: PrivateCallEvent;
  publicExecutionQueue: PublicEnqueueEvent[];
}

export class TxCallStackDecoder {
  private calldataMap: Map<string, any[]> = new Map();

  constructor(
    private pxe: PXE,
    private db: WalletDB
  ) {}

  private async formatAndResolveValue(value: AbiDecoded): Promise<string> {
    let formatted = formatAbiValue(value);

    // Try to resolve addresses
    if (value && typeof value === "object" && "toString" in value) {
      const valueStr = value.toString();
      if (valueStr.startsWith("0x") && valueStr.length === 66) {
        try {
          const addr = AztecAddress.fromString(valueStr);
          const alias = await getAddressAlias(this.pxe, this.db, addr);
          formatted = `${alias} (${formatted.slice(0, 10)}...${formatted.slice(-8)})`;
        } catch {
          // Not a valid address, use original formatted value
        }
      }
    }

    return formatted;
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
    const contractName = await getAddressAlias(
      this.pxe,
      this.db,
      callContext.contractAddress
    );
    const callerName = await getAddressAlias(
      this.pxe,
      this.db,
      callContext.msgSender
    );

    let functionName = `0x${callContext.functionSelector.toString().slice(2, 10)}`;
    let args: Array<{ name: string; value: string }> = [];
    let returnValues: Array<{ name: string; value: string }> = [];

    try {
      const metadata = await this.pxe.getContractMetadata(
        callContext.contractAddress
      );
      if (metadata.contractInstance) {
        const { artifact } = await this.pxe.getContractClassMetadata(
          metadata.contractInstance.currentContractClassId,
          true
        );
        const functionAbi = await getFunctionArtifact(
          artifact,
          callContext.functionSelector
        );
        functionName = functionAbi.name;

        // Decode arguments using the witness data
        // Note: The actual arguments aren't directly available in PrivateCallExecutionResult
        // They would need to be extracted from the witness or passed separately
        // For now, we'll leave args empty or indicate they're not available

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
    const contractName = await getAddressAlias(
      this.pxe,
      this.db,
      request.contractAddress
    );
    const callerName = await getAddressAlias(
      this.pxe,
      this.db,
      request.msgSender
    );

    // Get calldata using the calldataHash
    let functionName = "public_function";
    const calldataHashStr = request.calldataHash.toString();
    const calldata = this.calldataMap.get(calldataHashStr);

    if (calldata && calldata.length > 0) {
      try {
        // First element of calldata is the function selector
        const functionSelector = FunctionSelector.fromField(calldata[0]);

        // Try to resolve function name from contract ABI
        try {
          const metadata = await this.pxe.getContractMetadata(
            request.contractAddress
          );
          if (metadata.contractInstance) {
            const { artifact } = await this.pxe.getContractClassMetadata(
              metadata.contractInstance.currentContractClassId,
              true
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
            if (functionAbi) functionName = functionAbi.name;
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
    };
  }

  async decodeSimulationResult(
    simulationResult: TxSimulationResult
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
