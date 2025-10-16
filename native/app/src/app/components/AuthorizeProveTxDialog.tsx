import { useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
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
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import type { AuthorizationRequest } from "../../wallet-utils/authorization";
import type { ReadableCallAuthorization } from "../../wallet-utils/decoding/call-authorization-formatter";
import type { DecodedExecutionTrace } from "../../wallet-utils/decoding/tx-callstack-decoder";
import { ExecutionTraceDisplay } from "./ExecutionTraceDisplay";

interface AuthorizeProveTxContentProps {
  request: AuthorizationRequest;
  persistent?: boolean;
  onTogglePersistent?: () => void;
  showAppId?: boolean;
}

interface AuthorizeProveTxDialogProps {
  request: AuthorizationRequest;
  onApprove: () => void;
  onDeny: () => void;
}

// Reusable content component for displaying proveTx authorization details
export function AuthorizeProveTxContent({
  request,
  persistent = false,
  onTogglePersistent,
  showAppId = true,
}: AuthorizeProveTxContentProps) {
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

      {callAuthorizations.length === 0 ? (
          <Box
            sx={{
              mt: 2,
              p: 2,
              bgcolor: "background.default",
              borderRadius: 1,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No authorizations required for this transaction.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Function Calls Requiring Authorization (
              {callAuthorizations.length}):
            </Typography>
            {callAuthorizations.map((auth, index) => (
              <Accordion
                key={index}
                defaultExpanded={callAuthorizations.length === 1}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="subtitle1">
                      {auth.contract.name}.{auth.function}()
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Called by: {auth.caller.alias}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      gutterBottom
                    >
                      Contract:
                    </Typography>
                    <Box
                      sx={{
                        p: 1.5,
                        bgcolor: "background.default",
                        borderRadius: 1,
                        mb: 2,
                      }}
                    >
                      <Typography variant="body2" fontWeight="medium">
                        {auth.contract.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: "monospace",
                          wordBreak: "break-all",
                          color: "text.secondary",
                        }}
                      >
                        {auth.contract.address}
                      </Typography>
                    </Box>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      gutterBottom
                    >
                      Caller:
                    </Typography>
                    <Box
                      sx={{
                        p: 1.5,
                        bgcolor: "background.default",
                        borderRadius: 1,
                        mb: 2,
                      }}
                    >
                      <Typography variant="body2" fontWeight="medium">
                        {auth.caller.alias}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: "monospace",
                          wordBreak: "break-all",
                          color: "text.secondary",
                        }}
                      >
                        {auth.caller.address}
                      </Typography>
                    </Box>

                    {auth.parameters.length > 0 && (
                      <>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          gutterBottom
                        >
                          Parameters:
                        </Typography>
                        <Box
                          sx={{
                            p: 1,
                            bgcolor: "background.default",
                            borderRadius: 1,
                          }}
                        >
                          <Table size="small">
                            <TableBody>
                              {auth.parameters.map((param, paramIndex) => (
                                <TableRow key={paramIndex}>
                                  <TableCell
                                    sx={{
                                      fontFamily: "monospace",
                                      fontWeight: "medium",
                                      width: "30%",
                                      border: 0,
                                      py: 1,
                                    }}
                                  >
                                    {param.name}
                                  </TableCell>
                                  <TableCell
                                    sx={{
                                      fontFamily: "monospace",
                                      wordBreak: "break-all",
                                      border: 0,
                                      py: 1,
                                    }}
                                  >
                                    {param.value}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Box>
                      </>
                    )}
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}

        {/* Execution Trace */}
        {executionTrace && (
          <>
            <Divider sx={{ my: 3 }} />
            <ExecutionTraceDisplay trace={executionTrace} />
          </>
        )}

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        By approving, you authorize the app to execute these function calls on
        your behalf.
      </Typography>

      {onTogglePersistent && (
        <Box sx={{ mt: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={persistent}
                onChange={onTogglePersistent}
              />
            }
            label="Remember this authorization"
          />
        </Box>
      )}
    </>
  );
}

export function AuthorizeProveTxDialog({
  request,
  onApprove,
  onDeny,
}: AuthorizeProveTxDialogProps) {
  const [persistent, setPersistent] = useState(false);

  return (
    <Dialog open={true} maxWidth="lg" fullWidth>
      <DialogTitle>Transaction Authorization Request</DialogTitle>
      <DialogContent>
        <AuthorizeProveTxContent
          request={request}
          persistent={persistent}
          onTogglePersistent={() => setPersistent(!persistent)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onDeny} color="error">
          Deny
        </Button>
        <Button onClick={onApprove} color="primary" variant="contained">
          Approve
        </Button>
      </DialogActions>
    </Dialog>
  );
}
