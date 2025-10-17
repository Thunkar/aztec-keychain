import { useContext, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Typography,
  List,
  ListItem,
} from "@mui/material";
import { CheckCircle, Pending, Error as ErrorIcon } from "@mui/icons-material";
import type {
  WalletInteraction,
  WalletInteractionType,
} from "../../wallet-utils/wallet-interaction";
import { ExecutionTraceDialog } from "./ExecutionTraceDialog";
import type { DecodedExecutionTrace } from "../../wallet-utils/decoding/tx-callstack-decoder";
import { WalletContext } from "../../renderer";

interface InteractionsListProps {
  interactions: WalletInteraction<WalletInteractionType>[];
}

const getStatusColor = (status: string, complete: boolean) => {
  if (status.includes("ERROR") || status.includes("FAIL")) return "error";
  if (complete) return "success";
  return "primary";
};

const getStatusIcon = (status: string, complete: boolean) => {
  if (status.includes("ERROR") || status.includes("FAIL"))
    return <ErrorIcon fontSize="small" />;
  if (complete) return <CheckCircle fontSize="small" />;
  return <Pending fontSize="small" />;
};

const getInteractionTypeLabel = (type: WalletInteractionType) => {
  const labels: Record<WalletInteractionType, string> = {
    registerContract: "Register Contract",
    createAccount: "Create Account",
    simulateTx: "Simulate Transaction",
    proveTx: "Prove Transaction",
    sendTx: "Send Transaction",
    profileTx: "Profile Transaction",
  };
  return labels[type] || type;
};

export function InteractionsList({ interactions }: InteractionsListProps) {
  const { walletAPI } = useContext(WalletContext);
  const [selectedTrace, setSelectedTrace] =
    useState<DecodedExecutionTrace | null>(null);
  const [traceDialogOpen, setTraceDialogOpen] = useState(false);

  const handleInteractionClick = async (
    interaction: WalletInteraction<WalletInteractionType>
  ) => {
    // Only show trace for simulateTx and proveTx interactions
    if (interaction.type === "simulateTx" || interaction.type === "proveTx") {
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

  if (interactions.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>
        <Typography variant="body2">No interactions yet</Typography>
      </Box>
    );
  }

  return (
    <>
      <List sx={{ width: "100%", height: "100%", overflowY: "auto" }}>
        {interactions.map((interaction) => (
            <ListItem key={interaction.id} sx={{ px: 0, py: 0.5 }}>
              <Card
                sx={{
                  width: "100%",
                  bgcolor: "background.paper",
                  transition: "all 0.2s",
                  overflow: "hidden",
                  cursor:
                    interaction.type === "simulateTx" ||
                    interaction.type === "proveTx"
                      ? "pointer"
                      : "default",
                  "&:hover": {
                    boxShadow: 3,
                    transform: "translateY(-2px)",
                  },
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
                      variant="outlined"
                      sx={{ fontSize: "0.7rem", height: 20 }}
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

      <ExecutionTraceDialog
        open={traceDialogOpen}
        onClose={() => setTraceDialogOpen(false)}
        trace={selectedTrace}
      />
    </>
  );
}
