import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import type { AuthorizationRequest } from "../../wallet-utils/authorization";

interface AuthorizeSenderContentProps {
  request: AuthorizationRequest;
  persistent?: boolean;
  onTogglePersistent?: () => void;
  showAppId?: boolean;
}

// Reusable content component for displaying registerSender authorization details
export function AuthorizeSenderContent({
  request,
  persistent = false,
  onTogglePersistent,
  showAppId = true,
}: AuthorizeSenderContentProps) {
  const address = request.params.address || "Unknown";
  const alias = request.params.alias || "No alias provided";

  return (
    <>
      {showAppId && (
        <Typography variant="body1" gutterBottom>
          App <strong>{request.appId}</strong> wants to register a sender
          address.
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
          Address:
        </Typography>
        <Typography
          variant="body2"
          sx={{
            wordBreak: "break-all",
            fontFamily: "monospace",
            mt: 0.5,
          }}
        >
          {address.toString()}
        </Typography>
        {alias && alias !== "No alias provided" && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              Alias:
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {alias}
            </Typography>
          </>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        This will allow the app to register this address as a known sender in
        your wallet.
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
