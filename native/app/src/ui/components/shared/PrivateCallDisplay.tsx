import Box from "@mui/material/Box";
import type {
  PrivateCallEvent,
  ExecutionEvent,
} from "../../../wallet/decoding/tx-callstack-decoder";
import type { ReadableCallAuthorization } from "../../../wallet/decoding/call-authorization-formatter";
import { FunctionCallDisplay } from "./FunctionCallDisplay";
import { ExecutionEventDisplay } from "./ExecutionEventDisplay";

// Helper to check if a call requires authorization
function requiresAuthorization(
  call: PrivateCallEvent,
  authorizations?: ReadableCallAuthorization[]
): boolean {
  if (!authorizations || authorizations.length === 0) return false;

  return authorizations.some(
    (auth) =>
      auth.contract.address === call.contract.address &&
      auth.function === call.function
  );
}

export interface PrivateCallDisplayProps {
  call: PrivateCallEvent;
  authorizations?: ReadableCallAuthorization[];
  accordionBgColor?: string;
}

export function PrivateCallDisplay({
  call,
  authorizations,
  accordionBgColor,
}: PrivateCallDisplayProps) {
  const hasNestedEvents = call.nestedEvents.length > 0;
  const needsAuth = requiresAuthorization(call, authorizations);

  return (
    <FunctionCallDisplay
      contractName={call.contract.name}
      contractAddress={call.contract.address}
      functionName={call.function}
      args={call.args}
      returnValues={call.returnValues}
      callerName={call.caller.name}
      typeLabel="Private"
      depth={call.depth}
      isStaticCall={call.isStaticCall}
      needsAuth={needsAuth}
      accordionBgColor={accordionBgColor}
      nestedContent={
        hasNestedEvents ? (
          <Box sx={{ mt: 1 }}>
            {call.nestedEvents.map((event, i) => (
              <ExecutionEventDisplay
                key={i}
                event={event}
                authorizations={authorizations}
                accordionBgColor={accordionBgColor}
              />
            ))}
          </Box>
        ) : undefined
      }
    />
  );
}
