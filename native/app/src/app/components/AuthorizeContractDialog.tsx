import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import type { AuthorizationRequest } from "../../wallet-utils/authorization";

interface AuthorizeContractDialogProps {
  request: AuthorizationRequest;
  onApprove: () => void;
  onDeny: () => void;
}

export function AuthorizeContractDialog({
  request,
  onApprove,
  onDeny,
}: AuthorizeContractDialogProps) {
  const contractInfo = request.params[0] || {};
  const contractAddress = contractInfo.address || "Unknown";

  return (
    <Dialog open={true} maxWidth="sm" fullWidth>
      <DialogTitle>Contract Registration Request</DialogTitle>
      <DialogContent>
        <Typography variant="body1" gutterBottom>
          App <strong>{request.appId}</strong> wants to register a contract for
          interaction.
        </Typography>
        <Box
          sx={{
            mt: 2,
            p: 2,
            bgcolor: "background.default",
            borderRadius: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Contract Address:
          </Typography>
          <Typography
            variant="body2"
            sx={{
              wordBreak: "break-all",
              fontFamily: "monospace",
              mt: 0.5,
            }}
          >
            {contractAddress}
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          This will allow the app to interact with this contract. The contract
          will be registered in your wallet's PXE instance.
        </Typography>
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
