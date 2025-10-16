import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import type { AuthorizationItem } from "../../wallet-utils/authorization";

interface AuthorizeContractContentProps {
  request: AuthorizationItem;
  persistent?: boolean;
  onTogglePersistent?: () => void;
  showAppId?: boolean;
}

// Reusable content component for displaying registerContract authorization details
export function AuthorizeContractContent({
  request,
  persistent = false,
  onTogglePersistent,
  showAppId = true,
}: AuthorizeContractContentProps) {
  const contractAddress = request.params.contractAddress || request.params.address || "Unknown";

  return (
    <>
      {showAppId && (
        <Typography variant="body1" gutterBottom>
          App <strong>{request.appId}</strong> wants to register a contract for
          interaction.
        </Typography>
      )}
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
          {contractAddress.toString()}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        This will allow the app to interact with this contract. The contract
        will be registered in your wallet's PXE instance.
      </Typography>

      {onTogglePersistent && (
        <Box sx={{ mt: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={persistent}
                onChange={onTogglePersistent}
              />
            }
            label="Remember this authorization"
          />
        </Box>
      )}
    </>
  );
}
