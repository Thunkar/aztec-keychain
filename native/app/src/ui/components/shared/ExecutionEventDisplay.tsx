import type {
  ExecutionEvent,
} from "../../../wallet/decoding/tx-callstack-decoder";
import type { ReadableCallAuthorization } from "../../../wallet/decoding/call-authorization-formatter";
import { PrivateCallDisplay } from "./PrivateCallDisplay";
import { PublicEnqueueDisplay } from "./PublicEnqueueDisplay";

export interface ExecutionEventDisplayProps {
  event: ExecutionEvent;
  authorizations?: ReadableCallAuthorization[];
  accordionBgColor?: string;
}

export function ExecutionEventDisplay({
  event,
  authorizations,
  accordionBgColor,
}: ExecutionEventDisplayProps) {
  if (event.type === "private-call") {
    return (
      <PrivateCallDisplay
        call={event}
        authorizations={authorizations}
        accordionBgColor={accordionBgColor}
      />
    );
  } else {
    return <PublicEnqueueDisplay enqueue={event} />;
  }
}
