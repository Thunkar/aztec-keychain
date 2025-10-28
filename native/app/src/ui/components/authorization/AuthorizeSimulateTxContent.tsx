import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import type { AuthorizationItem } from "../../../wallet/types/authorization";
import type { ReadableCallAuthorization } from "../../../wallet/decoding/call-authorization-formatter";
import type { DecodedExecutionTrace } from "../../../wallet/decoding/tx-callstack-decoder";
import { ExecutionTraceDisplay } from "../shared/ExecutionTraceDisplay";

interface AuthorizeSimulateTxContentProps {
  request: AuthorizationItem;
  showAppId?: boolean;
}

// Content component for displaying simulateTx authorization details
export function AuthorizeSimulateTxContent({
  request,
  showAppId = true,
}: AuthorizeSimulateTxContentProps) {
  const params = request.params as {
    payloadHash?: string;
    callAuthorizations?: ReadableCallAuthorization[];
    executionTrace?: DecodedExecutionTrace | any;
    isUtility?: boolean;
  };
  const callAuthorizations = params.callAuthorizations || [];
  const executionTrace = params.executionTrace;
  const isUtility = params.isUtility || request.method === "simulateUtility";

  return (
    <>
      {showAppId && (
        <Typography variant="body1" gutterBottom>
          App <strong>{request.appId}</strong> wants to simulate a{" "}
          {isUtility ? "utility function" : "transaction"} and receive the
          execution details.
        </Typography>
      )}

      {executionTrace && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Simulation Preview:
          </Typography>
          <ExecutionTraceDisplay
            trace={executionTrace}
            callAuthorizations={callAuthorizations}
          />
        </Box>
      )}
    </>
  );
}
