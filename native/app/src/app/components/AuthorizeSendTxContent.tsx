import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Divider from "@mui/material/Divider";
import type { AuthorizationItem } from "../../wallet-utils/authorization";
import type { ReadableCallAuthorization } from "../../wallet-utils/decoding/call-authorization-formatter";
import type { DecodedExecutionTrace } from "../../wallet-utils/decoding/tx-callstack-decoder";
import { ExecutionTraceDisplay } from "./ExecutionTraceDisplay";

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
