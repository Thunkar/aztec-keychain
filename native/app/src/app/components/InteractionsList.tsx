import { Box, Card, CardContent, Chip, Typography, List, ListItem } from "@mui/material";
import { CheckCircle, Pending, Error as ErrorIcon } from "@mui/icons-material";
import type { WalletInteraction, WalletInteractionType } from "../../wallet-utils/wallet-interaction";

interface InteractionsListProps {
  interactions: WalletInteraction<WalletInteractionType>[];
}

const getStatusColor = (status: string, complete: boolean) => {
  if (complete) return "success";
  if (status.includes("ERROR") || status.includes("FAIL")) return "error";
  return "primary";
};

const getStatusIcon = (status: string, complete: boolean) => {
  if (complete) return <CheckCircle fontSize="small" />;
  if (status.includes("ERROR") || status.includes("FAIL")) return <ErrorIcon fontSize="small" />;
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
  if (interactions.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>
        <Typography variant="body2">No interactions yet</Typography>
      </Box>
    );
  }

  return (
    <List sx={{ width: "100%", maxHeight: "400px", overflow: "auto" }}>
      {interactions.slice().reverse().map((interaction) => (
        <ListItem key={interaction.id} sx={{ px: 0, py: 0.5 }}>
          <Card
            sx={{
              width: "100%",
              bgcolor: "background.paper",
              transition: "all 0.2s",
              "&:hover": {
                boxShadow: 3,
                transform: "translateY(-2px)",
              }
            }}
          >
            <CardContent sx={{ py: 1.5, px: 2, "&:last-child": { pb: 1.5 } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                <Chip
                  label={getInteractionTypeLabel(interaction.type)}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: "0.7rem", height: 20 }}
                />
                <Chip
                  icon={getStatusIcon(interaction.status, interaction.complete)}
                  label={interaction.status}
                  size="small"
                  color={getStatusColor(interaction.status, interaction.complete)}
                  sx={{ fontSize: "0.7rem", height: 20 }}
                />
              </Box>
              <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
                {interaction.title}
              </Typography>
              {interaction.description && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
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
                  opacity: 0.7
                }}
              >
                ID: {interaction.id.slice(0, 16)}...
              </Typography>
            </CardContent>
          </Card>
        </ListItem>
      ))}
    </List>
  );
}
