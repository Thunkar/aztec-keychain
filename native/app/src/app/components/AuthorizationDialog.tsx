import { useState, useEffect } from "react";
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
import type {
  AuthorizationRequest,
  AuthorizationItemResponse,
} from "../../wallet-utils/authorization";
import { AuthorizeProveTxContent } from "./AuthorizeProveTxContent";
import { AuthorizeContractContent } from "./AuthorizeContractContent";
import { AuthorizeSenderContent } from "./AuthorizeSenderContent";
import { AuthorizeAccountsContent } from "./AuthorizeAccountsContent";

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
    case "proveTx":
      return "Prove Transaction";
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

export function AuthorizationDialog({
  request,
  onApprove,
  onDeny,
  queueLength = 1,
}: AuthorizationDialogProps) {
  const items = request.items;

  const [itemStates, setItemStates] = useState<Map<string, ItemState>>(
    new Map(
      items.map((item) => [item.id, { approved: true, persistent: false }])
    )
  );

  // Reset state when request changes (new item from queue)
  useEffect(() => {
    setItemStates(
      new Map(
        items.map((item) => [item.id, { approved: true, persistent: false }])
      )
    );
  }, [request.id, items]); // Reset when request ID or items change

  const handleToggleApproval = (itemId: string) => {
    setItemStates((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId)!;
      newMap.set(itemId, { ...current, approved: !current.approved });
      return newMap;
    });
  };

  const handleTogglePersistent = (itemId: string) => {
    setItemStates((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId)!;
      newMap.set(itemId, { ...current, persistent: !current.persistent });
      return newMap;
    });
  };

  const handleItemDataChange = (itemId: string, data: any) => {
    setItemStates((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId)!;
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
        data:
          state.data ||
          (state.persistent
            ? ({
                persistent: true,
              } as any)
            : undefined),
      };
    }

    onApprove(itemResponses);
  };

  const approvedCount = Array.from(itemStates.values()).filter(
    (s) => s.approved
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
                      <Typography variant="caption" color="text.secondary">
                        {item.method}
                      </Typography>
                    </Box>
                  </Box>
                </AccordionSummary>

                <AccordionDetails>
                  <Box sx={{ pl: 5 }}>
                    {item.method === "proveTx" && (
                      <AuthorizeProveTxContent
                        request={item}
                        persistent={state.persistent}
                        onTogglePersistent={() =>
                          handleTogglePersistent(item.id)
                        }
                        showAppId={false}
                      />
                    )}

                    {item.method === "registerContract" && (
                      <AuthorizeContractContent
                        request={item}
                        persistent={state.persistent}
                        onTogglePersistent={() =>
                          handleTogglePersistent(item.id)
                        }
                        showAppId={false}
                      />
                    )}

                    {item.method === "registerSender" && (
                      <AuthorizeSenderContent
                        request={item}
                        persistent={state.persistent}
                        onTogglePersistent={() =>
                          handleTogglePersistent(item.id)
                        }
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
