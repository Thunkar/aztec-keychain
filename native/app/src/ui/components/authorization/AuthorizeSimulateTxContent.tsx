import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import type { AuthorizationItem } from "../../../wallet-utils/authorization";
import type { ReadableCallAuthorization } from "../../../wallet-utils/decoding/call-authorization-formatter";
import type { DecodedExecutionTrace } from "../../../wallet-utils/decoding/tx-callstack-decoder";
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

      <Typography
        variant="body2"
        sx={{
          bgcolor: "rgba(33, 150, 243, 0.15)",
          color: "text.primary",
          p: 1.5,
          borderRadius: 1,
          mb: 2,
          border: "1px solid",
          borderColor: "info.main",
        }}
      >
        <strong>Note:</strong> Simulations are run locally and do not affect the
        blockchain. This authorization controls what execution data the app can
        see from the simulation.
        {isUtility && (
          <>
            {" "}
            Utility functions do not go through account entrypoints and never
            pay fees.
          </>
        )}
      </Typography>

      {executionTrace && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Simulation Preview:
          </Typography>
          {isUtility && typeof executionTrace === "object" && "functionName" in executionTrace ? (
            // Simple display for utility functions
            <Box
              sx={{
                bgcolor: "background.default",
                p: 2,
                borderRadius: 1,
                fontFamily: "monospace",
              }}
            >
              <Typography variant="body2" gutterBottom>
                <strong>Function:</strong> {executionTrace.functionName}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Contract:</strong>{" "}
                {executionTrace.contractName || `${executionTrace.contractAddress?.substring(0, 16)}...`}
              </Typography>
              {executionTrace.args && (
                <Typography variant="body2" component="div">
                  <strong>Arguments:</strong>
                  <pre style={{ margin: "0.5em 0", fontSize: "0.85em" }}>
                    {JSON.stringify(executionTrace.args, null, 2)}
                  </pre>
                </Typography>
              )}
              {executionTrace.result && (
                <Typography variant="body2" component="div">
                  <strong>Result:</strong>
                  <pre style={{ margin: "0.5em 0", fontSize: "0.85em" }}>
                    {JSON.stringify(executionTrace.result, null, 2)}
                  </pre>
                </Typography>
              )}
            </Box>
          ) : (
            // Full execution trace for transactions
            <ExecutionTraceDisplay
              trace={executionTrace}
              callAuthorizations={callAuthorizations}
            />
          )}
        </Box>
      )}

      <Typography
        variant="body2"
        sx={{
          bgcolor: "rgba(255, 152, 0, 0.15)",
          color: "text.primary",
          p: 1.5,
          borderRadius: 1,
          mt: 2,
          border: "1px solid",
          borderColor: "warning.main",
        }}
      >
        <strong>Persistent Authorization:</strong> This authorization will be
        saved for the same {isUtility ? "function" : "transaction"} parameters.
        If the parameters change (different functions or arguments), you'll be
        asked again.
      </Typography>
    </>
  );
}
