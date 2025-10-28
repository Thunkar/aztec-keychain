import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Chip from "@mui/material/Chip";
import CallMadeIcon from "@mui/icons-material/CallMade";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import type { ReactNode } from "react";

export interface FunctionCallDisplayProps {
  contractName: string;
  contractAddress: string;
  functionName: string;
  args: Array<{ name: string; value: string }>;
  returnValues: Array<{ name: string; value: string }>;
  callerName?: string;
  typeLabel: "Private" | "Utility";
  typeChipColor?: "primary";
  depth?: number;
  isStaticCall?: boolean;
  needsAuth?: boolean;
  nestedContent?: ReactNode;
  accordionBgColor?: string;
}

export function FunctionCallDisplay({
  contractName,
  contractAddress,
  functionName,
  args,
  returnValues,
  callerName,
  typeLabel,
  typeChipColor = "primary",
  depth = 0,
  isStaticCall = false,
  needsAuth = false,
  nestedContent,
  accordionBgColor = "rgba(0, 0, 0, 0.01)",
}: FunctionCallDisplayProps) {
  const hasArgs = args.length > 0;
  const hasReturnValues = returnValues.length > 0;

  return (
    <Box
      sx={{
        ml: depth * 3,
        mb: 1,
        borderLeft: depth > 0 ? "2px solid" : "none",
        borderColor: "primary.main",
        pl: depth > 0 ? 2 : 0,
      }}
    >
      <Accordion
        sx={{
          bgcolor: accordionBgColor,
          boxShadow: 1,
          border: "1px solid",
          borderColor: "divider",
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
            <CallMadeIcon fontSize="small" color="primary" />
            <Typography
              variant="body2"
              sx={{ fontFamily: "monospace", fontWeight: "medium" }}
            >
              {contractName}.{functionName}({hasArgs ? "..." : ""})
            </Typography>
            <Chip
              label={typeLabel}
              size="small"
              color={typeChipColor}
              variant="outlined"
              sx={{ ml: 0.5 }}
            />
            {needsAuth && (
              <Chip
                icon={<VpnKeyIcon />}
                label="Requires Authorization"
                size="small"
                color="warning"
                variant="filled"
              />
            )}
            {isStaticCall && (
              <Chip label="static" size="small" variant="outlined" />
            )}
            {hasReturnValues && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontFamily: "monospace", ml: "auto" }}
              >
                → {returnValues.map((rv) => rv.value).join(", ")}
              </Typography>
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box>
            {/* Arguments (if available) - Show first as most important */}
            {hasArgs && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="subtitle2"
                  color="primary"
                  gutterBottom
                  sx={{ fontWeight: "bold" }}
                >
                  Arguments:
                </Typography>
                <Box
                  sx={{
                    p: 1.5,
                    bgcolor: "action.hover",
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
                  {args.map((arg, i) => (
                    <>
                      <Typography
                        key={`${i}-name`}
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.875rem",
                          fontWeight: "medium",
                          color: "primary.main",
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

            {/* Return Values */}
            {hasReturnValues && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="subtitle2"
                  color="primary"
                  gutterBottom
                  sx={{ fontWeight: "bold" }}
                >
                  Return Values:
                </Typography>
                <Box
                  sx={{
                    p: 1.5,
                    bgcolor: "action.hover",
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
                  {returnValues.map((rv, i) => (
                    <>
                      <Typography
                        key={`${i}-name`}
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.875rem",
                          fontWeight: "medium",
                          color: "primary.main",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {rv.name}:
                      </Typography>
                      <Typography
                        key={`${i}-value`}
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.8125rem",
                          wordBreak: "break-all",
                        }}
                      >
                        {rv.value}
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
                {contractName}
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
                {contractAddress}
              </Typography>
            </Box>

            {callerName && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Caller:
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                >
                  {callerName}
                </Typography>
              </Box>
            )}
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Nested Content */}
      {nestedContent}
    </Box>
  );
}
