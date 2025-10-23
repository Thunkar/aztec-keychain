import { useContext, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Button,
  IconButton,
  Tooltip,
  Alert,
} from "@mui/material";
import {
  Apps as AppsIcon,
  Edit as EditIcon,
  Block as RevokeIcon,
  AccountCircle,
} from "@mui/icons-material";
import { WalletContext } from "../../../../../renderer";
import { EditAccountAuthorizationDialog } from "../../../authorization/EditAccountAuthorizationDialog";

interface AppAuthorizationCardProps {
  appId: string;
  onRevoke: (appId: string) => Promise<void>;
  onUpdate: () => Promise<void>;
}

export function AppAuthorizationCard({
  appId,
  onRevoke,
  onUpdate,
}: AppAuthorizationCardProps) {
  const { walletAPI } = useContext(WalletContext);
  const [authorizations, setAuthorizations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    loadAuthorizations();
  }, [appId]);

  const loadAuthorizations = async () => {
    try {
      setLoading(true);
      const auths = await walletAPI.getAppAuthorizations(appId);
      setAuthorizations(auths);
    } catch (err) {
      console.error("Failed to load app authorizations:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (
      !confirm(
        `Are you sure you want to revoke all authorizations for ${appId}? The app will need to request authorization again.`
      )
    ) {
      return;
    }

    try {
      setRevoking(true);
      await onRevoke(appId);
    } catch (err) {
      console.error("Failed to revoke:", err);
    } finally {
      setRevoking(false);
    }
  };

  const handleEditSave = async () => {
    setEditDialogOpen(false);
    await loadAuthorizations();
    await onUpdate();
  };

  const accountsAuth = authorizations["getAccounts"];
  const accounts = accountsAuth?.accounts || [];

  return (
    <>
      <Card sx={{ width: "100%", position: "relative" }}>
        <CardContent>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              mb: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <AppsIcon color="primary" />
              <Typography variant="h6">{appId}</Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Tooltip title="Edit Permissions">
                <IconButton
                  size="small"
                  onClick={() => setEditDialogOpen(true)}
                  disabled={loading}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Revoke All Authorizations">
                <IconButton
                  size="small"
                  color="error"
                  onClick={handleRevoke}
                  disabled={loading || revoking}
                >
                  <RevokeIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {loading ? (
            <Typography variant="body2" color="text.secondary">
              Loading...
            </Typography>
          ) : (
            <>
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Authorized Accounts ({accounts.length})
                </Typography>
                {accounts.length === 0 ? (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    No accounts authorized
                  </Alert>
                ) : (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
                    {accounts.map((acc: { alias: string; item: string }) => (
                      <Chip
                        key={acc.item}
                        icon={<AccountCircle />}
                        label={acc.alias}
                        size="small"
                        variant="outlined"
                        sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                      />
                    ))}
                  </Box>
                )}
              </Box>

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Authorized Methods:{" "}
                  {Object.keys(authorizations).join(", ") || "None"}
                </Typography>
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      <EditAccountAuthorizationDialog
        open={editDialogOpen}
        appId={appId}
        currentAccounts={accounts}
        onClose={() => setEditDialogOpen(false)}
        onSave={handleEditSave}
      />
    </>
  );
}
