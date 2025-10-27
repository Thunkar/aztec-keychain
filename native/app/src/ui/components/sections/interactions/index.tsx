import { useContext, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Typography,
  List,
  ListItem,
  CircularProgress,
  keyframes,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Checkbox,
  ListItemText,
} from "@mui/material";
import { CheckCircle, Error as ErrorIcon } from "@mui/icons-material";
import type {
  WalletInteraction,
  WalletInteractionType,
} from "../../../../wallet/types/wallet-interaction";
import { ExecutionTraceDialog } from "../../dialogs/ExecutionTraceDialog";
import type { DecodedExecutionTrace } from "../../../../wallet/decoding/tx-callstack-decoder";
import { WalletContext } from "../../../renderer";

interface InteractionsListProps {
  interactions: WalletInteraction<WalletInteractionType>[];
  selectedTypes: WalletInteractionType[];
  onTypeFilterChange: (types: WalletInteractionType[]) => void;
}

const getStatusColor = (status: string, complete: boolean) => {
  if (status.includes("ERROR") || status.includes("FAIL")) return "error";
  if (complete) return "success";
  return "primary";
};

const pulse = keyframes`
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
`;

const shimmer = keyframes`
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
`;

const getStatusIcon = (status: string, complete: boolean) => {
  if (status.includes("ERROR") || status.includes("FAIL"))
    return <ErrorIcon fontSize="small" />;
  if (complete) return <CheckCircle fontSize="small" />;
  return <CircularProgress size={14} thickness={5} />;
};

const getInteractionTypeLabel = (type: WalletInteractionType) => {
  const labels: Record<WalletInteractionType, string> = {
    registerContract: "Register Contract",
    createAccount: "Create Account",
    simulateTx: "Simulate Transaction",
    simulateUtility: "Simulate Utility",
    sendTx: "Send Transaction",
    profileTx: "Profile Transaction",
    registerSender: "Register Sender",
  };
  return labels[type] || type;
};

const getInteractionTypeColor = (type: WalletInteractionType) => {
  const colors: Record<WalletInteractionType, string> = {
    registerContract: "#9c27b0", // purple
    createAccount: "#2196f3", // blue
    simulateTx: "#ff9800", // orange
    simulateUtility: "#ff9800", // orange (same as simulateTx)
    sendTx: "#7c4dff", // purple/violet (proving action)
    profileTx: "#00bcd4", // cyan
    registerSender: "#444444",
  };
  return colors[type];
};

const allInteractionTypes: WalletInteractionType[] = [
  "registerContract",
  "createAccount",
  "simulateTx",
  "simulateUtility",
  "sendTx",
  "profileTx",
];

export function InteractionsList({
  interactions,
  selectedTypes,
  onTypeFilterChange,
}: InteractionsListProps) {
  const { walletAPI } = useContext(WalletContext);
  const [selectedTrace, setSelectedTrace] =
    useState<DecodedExecutionTrace | null>(null);
  const [traceDialogOpen, setTraceDialogOpen] = useState(false);

  const handleInteractionClick = async (
    interaction: WalletInteraction<WalletInteractionType>
  ) => {
    // Only show trace for simulateTx, simulateUtility, and sendTx interactions
    if (
      interaction.type === "simulateTx" ||
      interaction.type === "sendTx" ||
      interaction.type === "simulateUtility"
    ) {
      try {
        const trace = await walletAPI.getExecutionTrace(interaction.id);
        if (trace) {
          setSelectedTrace(trace);
          setTraceDialogOpen(true);
        }
      } catch (error) {
        console.error("Failed to load execution trace:", error);
      }
    }
  };

  const handleTypeFilterChange = (event: any) => {
    const value = event.target.value as WalletInteractionType[];
    onTypeFilterChange(value);
  };

  // Filter interactions based on selected types
  const filteredInteractions =
    selectedTypes.length === 0 ||
    selectedTypes.length === allInteractionTypes.length
      ? interactions
      : interactions.filter((interaction) =>
          selectedTypes.includes(interaction.type)
        );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Interactions List */}
      <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
        {filteredInteractions.length === 0 ? (
          <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>
            <Typography variant="body2">
              {interactions.length === 0
                ? "No interactions yet"
                : "No interactions match the selected filters"}
            </Typography>
          </Box>
        ) : (
          <List sx={{ width: "100%", p: 0 }}>
            {filteredInteractions.map((interaction) => (
              <ListItem key={interaction.id} sx={{ px: 0, py: 0.5 }}>
                <Card
                  sx={{
                    width: "100%",
                    bgcolor: "background.paper",
                    transition: "all 0.2s",
                    overflow: "hidden",
                    cursor:
                      interaction.type === "simulateTx" ||
                      interaction.type === "simulateUtility" ||
                      interaction.type === "sendTx"
                        ? "pointer"
                        : "default",
                    borderLeft: "4px solid",
                    borderColor: getInteractionTypeColor(interaction.type),
                    "&:hover": {
                      boxShadow: 3,
                      transform: "translateY(-2px)",
                    },
                    // Add shimmer effect for in-progress interactions
                    ...(!interaction.complete && {
                      position: "relative",
                      "&::before": {
                        content: '""',
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: `linear-gradient(
                        90deg,
                        transparent 0%,
                        rgba(33, 150, 243, 0.1) 50%,
                        transparent 100%
                      )`,
                        backgroundSize: "1000px 100%",
                        animation: `${shimmer} 2s infinite linear`,
                        pointerEvents: "none",
                      },
                      animation: `${pulse} 2s ease-in-out infinite`,
                    }),
                  }}
                  onClick={() => handleInteractionClick(interaction)}
                >
                  <CardContent
                    sx={{ py: 1.5, px: 2, "&:last-child": { pb: 1.5 } }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 0.5,
                      }}
                    >
                      <Chip
                        label={getInteractionTypeLabel(interaction.type)}
                        size="small"
                        sx={{
                          fontSize: "0.7rem",
                          height: 20,
                          bgcolor: getInteractionTypeColor(interaction.type),
                          color: "white",
                          fontWeight: 600,
                          "& .MuiChip-label": {
                            px: 1,
                          },
                        }}
                      />
                      <Chip
                        icon={getStatusIcon(
                          interaction.status,
                          interaction.complete
                        )}
                        label={interaction.status}
                        size="small"
                        color={getStatusColor(
                          interaction.status,
                          interaction.complete
                        )}
                        sx={{ fontSize: "0.7rem", height: 20 }}
                      />
                    </Box>
                    <Typography
                      variant="body2"
                      fontWeight={500}
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {interaction.title}
                    </Typography>
                    {interaction.description && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {interaction.description}
                      </Typography>
                    )}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: "block",
                        mt: 0.5,
                        fontFamily: "monospace",
                        fontSize: "0.65rem",
                        opacity: 0.7,
                      }}
                    >
                      ID: {interaction.id.slice(0, 16)}...
                    </Typography>
                  </CardContent>
                </Card>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      {/* Filter Controls at Bottom */}
      <Box sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
        <FormControl fullWidth size="small">
          <InputLabel id="interaction-type-filter-label">
            Filter by Type
          </InputLabel>
          <Select
            labelId="interaction-type-filter-label"
            id="interaction-type-filter"
            multiple
            value={selectedTypes}
            onChange={handleTypeFilterChange}
            input={<OutlinedInput label="Filter by Type" />}
            renderValue={(selected) =>
              selected.length === 0 ||
              selected.length === allInteractionTypes.length
                ? "All Types"
                : `${selected.length} type${selected.length > 1 ? "s" : ""}`
            }
          >
            {allInteractionTypes.map((type) => (
              <MenuItem key={type} value={type}>
                <Checkbox checked={selectedTypes.indexOf(type) > -1} />
                <ListItemText primary={getInteractionTypeLabel(type)} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <ExecutionTraceDialog
        open={traceDialogOpen}
        onClose={() => setTraceDialogOpen(false)}
        trace={selectedTrace}
      />
    </Box>
  );
}
