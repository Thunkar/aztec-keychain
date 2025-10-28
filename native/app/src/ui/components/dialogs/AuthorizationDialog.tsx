import { useState, useEffect, useContext } from "react";
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
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Card from "@mui/material/Card";
import { Apps as AppsIcon, AccountCircle } from "@mui/icons-material";
import type {
  AuthorizationRequest,
  AuthorizationItemResponse,
  AuthorizationItem,
} from "../../../wallet/types/authorization";
import { AuthorizeSendTxContent } from "../authorization/AuthorizeSendTxContent";
import { AuthorizeSimulateTxContent } from "../authorization/AuthorizeSimulateTxContent";
import { AuthorizeContractContent } from "../authorization/AuthorizeContractContent";
import { AuthorizeSenderContent } from "../authorization/AuthorizeSenderContent";
import { AuthorizeAccountsContent } from "../authorization/AuthorizeAccountsContent";
import { WalletContext } from "../../renderer";
import { AztecAddress } from "@aztec/aztec.js/addresses";

interface AuthorizationDialogProps {
  request: AuthorizationRequest;
  onApprove: (itemResponses: Record<string, AuthorizationItemResponse>) => void;
  onDeny: () => void;
  queueLength?: number;
}

interface ItemState {
  approved: boolean;
  persistent: boolean;
  data?: any; // Method-specific data (e.g., selected accounts for getAccounts)
}

function formatMethodName(method: string): string {
  switch (method) {
    case "sendTx":
      return "Send Transaction";
    case "simulateTx":
      return "Simulate Transaction";
    case "simulateUtility":
      return "Simulate Utility Function";
    case "registerContract":
      return "Register Contract";
    case "registerSender":
      return "Register Sender";
    case "getAccounts":
      return "Get Accounts";
    default:
      return method;
  }
}

function getMethodSubtitle(item: AuthorizationItem): string | null {
  switch (item.method) {
    case "registerContract": {
      const address = item.params.address || item.params.contractAddress;
      const contractName = item.params.contractName;
      if (contractName && contractName !== "Unknown Contract") {
        return `${contractName} (${address ? address.substring(0, 10) + "..." : "unknown"})`;
      }
      return address ? address.substring(0, 16) + "..." : "Unknown contract";
    }
    case "registerSender":
      return item.params.alias || item.params.address?.substring(0, 16) + "...";
    case "getAccounts":
      return "Access your wallet addresses";
    case "sendTx": {
      // Show the transaction title if available
      const title = item.params.title;
      return title || "Execute contract interaction";
    }
    case "simulateTx": {
      // Show the precomputed title (filters out wallet calls, shows user-initiated calls)
      const title = item.params.title;
      if (title && title !== "Transaction") {
        return title;
      }
      // Fallback to extracting from execution trace if title not available
      const executionTrace = item.params.executionTrace;
      if (executionTrace && typeof executionTrace === "object") {
        const privateExecution = executionTrace.privateExecution;
        if (privateExecution && typeof privateExecution === "object") {
          const contractName = privateExecution.contract?.name || "Unknown";
          const functionName = privateExecution.function || "unknown";
          return `${contractName}::${functionName}`;
        }
      }
      return "Simulate contract interaction";
    }
    case "simulateUtility": {
      // Show utility function details if available
      const executionTrace = item.params.executionTrace;
      if (executionTrace && typeof executionTrace === "object") {
        const contractName = executionTrace.contractName || "Unknown";
        const functionName = executionTrace.functionName || "unknown";
        return `${contractName}::${functionName}`;
      }
      return "Simulate utility function";
    }
    default:
      return null;
  }
}

export function AuthorizationDialog({
  request,
  onApprove,
  onDeny,
  queueLength = 1,
}: AuthorizationDialogProps) {
  const { walletAPI } = useContext(WalletContext);
  const items = request.items;
  const [accountList, setAccountList] = useState<
    Array<{ alias: string; item: AztecAddress }>
  >([]);

  // Load accounts for displaying "from" information
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const accounts = await walletAPI.getAccounts();
        setAccountList(accounts);
      } catch (err) {
        console.error("Failed to load accounts:", err);
      }
    };
    loadAccounts();
  }, [walletAPI]);

  const [itemStates, setItemStates] = useState<Map<string, ItemState>>(
    new Map(
      items.map((item) => [
        item.id,
        {
          approved: true,
          persistent:
            item.method === "getAccounts" ||
            item.method === "simulateTx" ||
            item.method === "simulateUtility",
        },
      ])
    )
  );

  // Reset state when request changes (new item from queue)
  useEffect(() => {
    setItemStates(
      new Map(
        items.map((item) => [
          item.id,
          {
            approved: true,
            persistent:
              item.method === "getAccounts" ||
              item.method === "simulateTx" ||
              item.method === "simulateUtility",
          },
        ])
      )
    );
  }, [request.id, items]); // Reset when request ID or items change

  const handleToggleApproval = (itemId: string) => {
    setItemStates((prev) => {
      const newMap = new Map<string, ItemState>(prev);
      const current = newMap.get(itemId);
      if (!current) return prev;
      newMap.set(itemId, { ...current, approved: !current.approved });
      return newMap;
    });
  };

  const handleItemDataChange = (itemId: string, data: any) => {
    setItemStates((prev) => {
      const newMap = new Map<string, ItemState>(prev);
      const current = newMap.get(itemId);
      if (!current) return prev;
      newMap.set(itemId, { ...current, data });
      return newMap;
    });
  };

  const handleApprove = () => {
    const itemResponses: Record<string, AuthorizationItemResponse> = {};

    for (const item of items) {
      const state = itemStates.get(item.id);

      // Skip items that haven't been initialized yet
      if (!state) {
        continue;
      }

      itemResponses[item.id] = {
        id: item.id,
        approved: state.approved,
        appId: item.appId,
        data: state.data
          ? {
              ...state.data,
              ...(state.persistent ? { persistent: true } : {}),
            }
          : state.persistent
            ? ({ persistent: true } as any)
            : undefined,
      };
    }

    onApprove(itemResponses);
  };

  const approvedCount = Array.from(itemStates.values()).filter(
    (s: ItemState) => s.approved
  ).length;

  return (
    <Dialog open={true} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>Authorization Request</span>
          {queueLength > 1 && (
            <Typography
              variant="caption"
              sx={{
                bgcolor: "primary.main",
                color: "primary.contrastText",
                px: 1.5,
                py: 0.5,
                borderRadius: 1,
                fontWeight: "bold",
              }}
            >
              {queueLength} pending
            </Typography>
          )}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" gutterBottom>
          App <strong>{request.appId}</strong> is requesting to perform{" "}
          {items.length} operation{items.length > 1 ? "s" : ""}:
        </Typography>

        <Box sx={{ mt: 2 }}>
          {items.map((item, index) => {
            const state = itemStates.get(item.id);

            // Skip rendering if state hasn't been initialized yet
            if (!state) {
              return null;
            }

            return (
              <Accordion
                key={item.id}
                defaultExpanded={items.length === 1}
                sx={{
                  mb: 1,
                  border: state.approved ? "2px solid" : "1px solid",
                  borderColor: state.approved ? "primary.main" : "divider",
                  bgcolor: "background.paper",
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box
                    sx={{ display: "flex", alignItems: "center", flexGrow: 1 }}
                  >
                    <Checkbox
                      checked={state.approved}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleApproval(item.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Box>
                      <Typography variant="subtitle1">
                        {index + 1}. {formatMethodName(item.method)}
                      </Typography>
                      {getMethodSubtitle(item) && (
                        <Typography variant="caption" color="text.secondary">
                          {getMethodSubtitle(item)}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </AccordionSummary>

                <AccordionDetails>
                  <Box sx={{ pl: 5 }}>
                    {/* Prominent info card for sendTx and simulateTx */}
                    {(item.method === "sendTx" ||
                      item.method === "simulateTx") &&
                      item.params.from && (
                        <Card
                          sx={{
                            mb: 2,
                            bgcolor: "action.hover",
                            border: "2px solid",
                            borderColor: "primary.main",
                          }}
                        >
                          <Box sx={{ p: 2 }}>
                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 1.5,
                              }}
                            >
                              {/* App Info */}
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                <AppsIcon fontSize="small" color="primary" />
                                <Typography variant="body2" fontWeight="medium">
                                  App:
                                </Typography>
                                <Chip
                                  label={request.appId}
                                  size="small"
                                  sx={{
                                    fontWeight: 600,
                                    bgcolor: "rgba(25, 118, 210, 0.08)",
                                    color: "primary.main",
                                    border: "1px solid",
                                    borderColor: "primary.main",
                                  }}
                                />
                              </Box>
                              {/* From Account Info */}
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                <AccountCircle
                                  fontSize="small"
                                  color="primary"
                                />
                                <Typography variant="body2" fontWeight="medium">
                                  From:
                                </Typography>
                                {(() => {
                                  const fromAddress = item.params.from;
                                  const account = accountList.find((a) =>
                                    a.item.equals(
                                      AztecAddress.fromString(fromAddress)
                                    )
                                  );
                                  const internalAlias =
                                    account?.alias || "Unknown Account";
                                  const formattedAddress = fromAddress
                                    ? `${fromAddress.slice(0, 10)}...${fromAddress.slice(-8)}`
                                    : "Unknown";
                                  return (
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                      }}
                                    >
                                      <Typography
                                        variant="body2"
                                        fontWeight="bold"
                                      >
                                        {internalAlias}
                                      </Typography>
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          fontFamily: "monospace",
                                          color: "text.secondary",
                                        }}
                                      >
                                        ({formattedAddress})
                                      </Typography>
                                    </Box>
                                  );
                                })()}
                              </Box>
                            </Box>
                          </Box>
                        </Card>
                      )}

                    {item.method === "sendTx" && (
                      <AuthorizeSendTxContent
                        request={item}
                        showAppId={false}
                      />
                    )}

                    {(item.method === "simulateTx" ||
                      item.method === "simulateUtility") && (
                      <AuthorizeSimulateTxContent
                        request={item}
                        showAppId={false}
                      />
                    )}

                    {item.method === "registerContract" && (
                      <AuthorizeContractContent
                        request={item}
                        showAppId={false}
                      />
                    )}

                    {item.method === "registerSender" && (
                      <AuthorizeSenderContent
                        request={item}
                        showAppId={false}
                      />
                    )}

                    {item.method === "getAccounts" && (
                      <AuthorizeAccountsContent
                        request={item}
                        onAccountsChange={(accounts) => {
                          handleItemDataChange(item.id, { accounts });
                        }}
                        showAppId={false}
                      />
                    )}
                  </Box>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Review each operation above and select which ones you want to approve.
          You can approve all, some, or none of the requested operations.
        </Typography>
      </DialogContent>

      <DialogActions>
        <Button onClick={onDeny} color="error">
          Deny All
        </Button>
        <Button
          onClick={handleApprove}
          color="primary"
          variant="contained"
          disabled={approvedCount === 0}
        >
          Approve Selected ({approvedCount})
        </Button>
      </DialogActions>
    </Dialog>
  );
}
