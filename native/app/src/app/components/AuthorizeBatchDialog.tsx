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
import Checkbox from "@mui/material/Checkbox";
import type {
  BatchAuthorizationRequest,
  BatchAuthorizationResponse,
  AuthorizationResponse,
} from "../../wallet-utils/authorization";
import { AuthorizeProveTxContent } from "./AuthorizeProveTxDialog";
import { AuthorizeContractContent } from "./AuthorizeContractDialog";
import { AuthorizeSenderContent } from "./AuthorizeSenderContent";

interface AuthorizeBatchDialogProps {
  request: BatchAuthorizationRequest;
  onApprove: (response: BatchAuthorizationResponse["data"]) => void;
  onDeny: () => void;
}

interface ItemState {
  approved: boolean;
  persistent: boolean;
}

function formatMethodName(method: string): string {
  switch (method) {
    case "proveTx":
      return "Prove Transaction";
    case "registerContract":
      return "Register Contract";
    case "registerSender":
      return "Register Sender";
    default:
      return method;
  }
}

export function AuthorizeBatchDialog({
  request,
  onApprove,
  onDeny,
}: AuthorizeBatchDialogProps) {
  const items = request.params.items;

  const [itemStates, setItemStates] = useState<Map<string, ItemState>>(
    new Map(
      items.map((item) => [item.id, { approved: true, persistent: false }])
    )
  );

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

  const handleApprove = () => {
    const itemResponses: Record<string, AuthorizationResponse> = {};

    for (const item of items) {
      const state = itemStates.get(item.id)!;
      itemResponses[item.id] = {
        id: item.id,
        approved: state.approved,
        appId: item.appId,
        data: state.persistent
          ? {
              persistent: true,
              params: item.params,
            }
          : undefined,
      };
    }

    onApprove({ itemResponses });
  };

  const approvedCount = Array.from(itemStates.values()).filter(
    (s) => s.approved
  ).length;

  return (
    <Dialog open={true} maxWidth="lg" fullWidth>
      <DialogTitle>Batch Authorization Request</DialogTitle>
      <DialogContent>
        <Typography variant="body1" gutterBottom>
          App <strong>{request.appId}</strong> is requesting to perform{" "}
          {items.length} operation{items.length > 1 ? "s" : ""}:
        </Typography>

        <Box sx={{ mt: 2 }}>
          {items.map((item, index) => {
            const state = itemStates.get(item.id)!;

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
