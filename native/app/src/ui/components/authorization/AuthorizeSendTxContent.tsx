import Typography from "@mui/material/Typography";
import type { AuthorizationItem } from "../../../wallet/types/authorization";
import type { ReadableCallAuthorization } from "../../../wallet/decoding/call-authorization-formatter";
import type { DecodedExecutionTrace } from "../../../wallet/decoding/tx-callstack-decoder";
import { ExecutionTraceDisplay } from "../shared/ExecutionTraceDisplay";

interface AuthorizeSendTxContentProps {
  request: AuthorizationItem;
  showAppId?: boolean;
}

// Reusable content component for displaying sendTx authorization details
export function AuthorizeSendTxContent({
  request,
  showAppId = true,
}: AuthorizeSendTxContentProps) {
  const params = request.params as {
    callAuthorizations?: ReadableCallAuthorization[];
    executionTrace?: DecodedExecutionTrace;
  };
  const callAuthorizations = params.callAuthorizations || [];
  const executionTrace = params.executionTrace;

  return (
    <>
      {showAppId && (
        <Typography variant="body1" gutterBottom>
          App <strong>{request.appId}</strong> wants to execute a transaction
          that requires your authorization.
        </Typography>
      )}

      {executionTrace && (
        <ExecutionTraceDisplay
          trace={executionTrace}
          callAuthorizations={callAuthorizations}
        />
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        By approving, you authorize the app to execute these function calls on
        your behalf.
      </Typography>
    </>
  );
}
