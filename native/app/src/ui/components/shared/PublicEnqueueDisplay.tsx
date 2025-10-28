import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Chip from "@mui/material/Chip";
import PublicIcon from "@mui/icons-material/Public";
import type { PublicEnqueueEvent } from "../../../wallet/decoding/tx-callstack-decoder";

export interface PublicEnqueueDisplayProps {
  enqueue: PublicEnqueueEvent;
}

export function PublicEnqueueDisplay({ enqueue }: PublicEnqueueDisplayProps) {
  const hasArgs = enqueue.args?.length > 0;

  return (
    <Box
      sx={{
        ml: enqueue.depth * 3,
        mb: 1,
        borderLeft: enqueue.depth > 0 ? "2px solid" : "none",
        borderColor: "warning.main",
        pl: enqueue.depth > 0 ? 2 : 0,
      }}
    >
      <Accordion
        sx={{
          bgcolor: "rgba(255, 152, 0, 0.15)",
          boxShadow: 1,
          border: "1px solid",
          borderColor: "warning.main",
        }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
              width: "100%",
            }}
          >
            <PublicIcon fontSize="small" color="warning" />
            <Typography
              variant="body2"
              sx={{ fontFamily: "monospace", fontWeight: "medium" }}
            >
              {enqueue.contract.name}.{enqueue.function}({hasArgs ? "..." : ""})
            </Typography>
            <Chip
              label="Public"
              size="small"
              color="warning"
              variant="outlined"
              sx={{ ml: 0.5 }}
            />
            {enqueue.isStaticCall && (
              <Chip label="static" size="small" variant="outlined" />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 2 }}
            >
              Will execute on node after private execution completes
            </Typography>

            {/* Arguments (if available) */}
            {hasArgs && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="subtitle2"
                  color="warning.dark"
                  gutterBottom
                  sx={{ fontWeight: "bold" }}
                >
                  Arguments:
                </Typography>
                <Box
                  sx={{
                    p: 1.5,
                    bgcolor: "background.paper",
                    borderRadius: 1,
                    border: "1px solid",
                    borderColor: "divider",
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: 1,
                    columnGap: 2,
                    alignItems: "start",
                  }}
                >
                  {enqueue.args.map((arg, i) => (
                    <>
                      <Typography
                        key={`${i}-name`}
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.875rem",
                          fontWeight: "medium",
                          color: "warning.dark",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {arg.name}:
                      </Typography>
                      <Typography
                        key={`${i}-value`}
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.8125rem",
                          wordBreak: "break-all",
                        }}
                      >
                        {arg.value}
                      </Typography>
                    </>
                  ))}
                </Box>
              </Box>
            )}

            {/* Call Details */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Contract:
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
              >
                {enqueue.contract.name}
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
                {enqueue.contract.address}
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
                {enqueue.caller.name}
              </Typography>
            </Box>
          </Box>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
