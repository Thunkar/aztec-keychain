import type {
  DecodedExecutionTrace,
} from "../../../wallet/decoding/tx-callstack-decoder";
import type { ReadableCallAuthorization } from "../../../wallet/decoding/call-authorization-formatter";
import { FunctionCallDisplay } from "./FunctionCallDisplay";
import { PrivateCallDisplay } from "./PrivateCallDisplay";

// Utility execution trace type
interface UtilityExecutionTrace {
  functionName: string;
  args: Array<{ name: string; value: string }>;
  contractAddress: string;
  contractName: string;
  result: string;
  isUtility: true;
}

interface ExecutionTraceDisplayProps {
  trace: DecodedExecutionTrace | UtilityExecutionTrace;
  callAuthorizations?: ReadableCallAuthorization[];
  accordionBgColor?: string;
}

export function ExecutionTraceDisplay({
  trace,
  callAuthorizations,
  accordionBgColor,
}: ExecutionTraceDisplayProps) {
  // Check if this is a utility trace
  if ("isUtility" in trace && trace.isUtility) {
    const utilityTrace = trace as UtilityExecutionTrace;

    // Convert result to return values format (result is already formatted as a string)
    const returnValues =
      utilityTrace.result !== undefined && utilityTrace.result !== ""
        ? [{ name: "result", value: utilityTrace.result }]
        : [];

    return (
      <FunctionCallDisplay
        contractName={utilityTrace.contractName}
        contractAddress={utilityTrace.contractAddress}
        functionName={utilityTrace.functionName}
        args={utilityTrace.args}
        returnValues={returnValues}
        typeLabel="Utility"
        accordionBgColor={accordionBgColor}
      />
    );
  }

  // Full transaction trace
  const decodedTrace = trace as DecodedExecutionTrace;
  return (
    <PrivateCallDisplay
      call={decodedTrace.privateExecution}
      authorizations={callAuthorizations}
      accordionBgColor={accordionBgColor}
    />
  );
}
