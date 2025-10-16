import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import CallMadeIcon from "@mui/icons-material/CallMade";
import ScheduleIcon from "@mui/icons-material/Schedule";
import PublicIcon from "@mui/icons-material/Public";
import type {
  DecodedExecutionTrace,
  ExecutionEvent,
  PrivateCallEvent,
  PublicEnqueueEvent,
} from "../../wallet-utils/decoding/tx-callstack-decoder";

interface ExecutionTraceDisplayProps {
  trace: DecodedExecutionTrace;
}

function PrivateCallDisplay({ call }: { call: PrivateCallEvent }) {
  const hasNestedEvents = call.nestedEvents.length > 0;
  const hasReturnValues = call.returnValues.length > 0;

  return (
    <Box
      sx={{
        ml: call.depth * 3,
        mb: 1,
        borderLeft: call.depth > 0 ? "2px solid" : "none",
        borderColor: "primary.main",
        pl: call.depth > 0 ? 2 : 0,
      }}
    >
      <Accordion
        defaultExpanded={call.depth < 2}
        sx={{
          bgcolor: "background.default",
          boxShadow: 1,
        }}
      >
        <AccordionSummary
          expandIcon={hasNestedEvents ? <ExpandMoreIcon /> : null}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
              width: "100%",
            }}
          >
            <CallMadeIcon fontSize="small" color="primary" />
            <Typography
              variant="body2"
              sx={{ fontFamily: "monospace", fontWeight: "medium" }}
            >
              {call.contract.name}.{call.function}()
            </Typography>
            {call.isStaticCall && (
              <Chip label="static" size="small" variant="outlined" />
            )}
            {hasReturnValues && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontFamily: "monospace", ml: "auto" }}
              >
                → {call.returnValues.map((rv) => rv.value).join(", ")}
              </Typography>
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box>
            {/* Call Details */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Contract:
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
              >
                {call.contract.name}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  color: "text.secondary",
                  display: "block",
                }}
              >
                {call.contract.address}
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Caller:
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
              >
                {call.caller.name}
              </Typography>
            </Box>

            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Counters:
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                {call.counter.start} → {call.counter.end}
              </Typography>
            </Box>

            {/* Return Values */}
            {hasReturnValues && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  gutterBottom
                >
                  Return Values:
                </Typography>
                <Box
                  sx={{
                    p: 1,
                    bgcolor: "background.paper",
                    borderRadius: 1,
                  }}
                >
                  <Table size="small">
                    <TableBody>
                      {call.returnValues.map((rv, i) => (
                        <TableRow key={i}>
                          <TableCell
                            sx={{
                              fontFamily: "monospace",
                              fontWeight: "medium",
                              border: 0,
                              py: 0.5,
                            }}
                          >
                            {rv.name}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontFamily: "monospace",
                              wordBreak: "break-all",
                              border: 0,
                              py: 0.5,
                            }}
                          >
                            {rv.value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </Box>
            )}

            {/* Arguments (if available) */}
            {call.args.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  gutterBottom
                >
                  Arguments:
                </Typography>
                <Box
                  sx={{
                    p: 1,
                    bgcolor: "background.paper",
                    borderRadius: 1,
                  }}
                >
                  <Table size="small">
                    <TableBody>
                      {call.args.map((arg, i) => (
                        <TableRow key={i}>
                          <TableCell
                            sx={{
                              fontFamily: "monospace",
                              fontWeight: "medium",
                              border: 0,
                              py: 0.5,
                            }}
                          >
                            {arg.name}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontFamily: "monospace",
                              wordBreak: "break-all",
                              border: 0,
                              py: 0.5,
                            }}
                          >
                            {arg.value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              </Box>
            )}
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Nested Events */}
      {hasNestedEvents && (
        <Box sx={{ mt: 1 }}>
          {call.nestedEvents.map((event, i) => (
            <ExecutionEventDisplay key={i} event={event} />
          ))}
        </Box>
      )}
    </Box>
  );
}

function PublicEnqueueDisplay({ enqueue }: { enqueue: PublicEnqueueEvent }) {
  return (
    <Box
      sx={{
        ml: enqueue.depth * 3,
        mb: 1,
        p: 1.5,
        bgcolor: "warning.light",
        borderRadius: 1,
        borderLeft: "4px solid",
        borderColor: "warning.main",
      }}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
      >
        <PublicIcon fontSize="small" color="warning" />
        <Typography
          variant="body2"
          sx={{ fontFamily: "monospace", fontWeight: "medium" }}
        >
          Enqueued Public: {enqueue.contract.name}.{enqueue.function}()
        </Typography>
        <Chip
          icon={<ScheduleIcon />}
          label={`counter: ${enqueue.counter}`}
          size="small"
          color="warning"
          variant="outlined"
        />
        {enqueue.isStaticCall && (
          <Chip label="static" size="small" variant="outlined" />
        )}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 0.5 }}
      >
        Will execute on node after private execution completes
      </Typography>
    </Box>
  );
}

function ExecutionEventDisplay({ event }: { event: ExecutionEvent }) {
  if (event.type === "private-call") {
    return <PrivateCallDisplay call={event} />;
  } else {
    return <PublicEnqueueDisplay enqueue={event} />;
  }
}

export function ExecutionTraceDisplay({ trace }: ExecutionTraceDisplayProps) {
  return (
    <Box>
      {/* Private Execution Section */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Execution trace
        </Typography>
        <Box sx={{ mt: 2 }}>
          <PrivateCallDisplay call={trace.privateExecution} />
        </Box>
      </Box>
    </Box>
  );
}
