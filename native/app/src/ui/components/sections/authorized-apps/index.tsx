import { useContext, useEffect, useState } from "react";
import { Box, Typography, Alert, CircularProgress } from "@mui/material";
import { WalletContext } from "../../../renderer";
import { useNetwork } from "../../../contexts/NetworkContext";
import { AppAuthorizationCard } from "./components/AppAuthorizationCard";

export function AuthorizedApps() {
  const { walletAPI } = useContext(WalletContext);
  const { currentNetwork } = useNetwork();
  const [apps, setApps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadApps = async () => {
    try {
      setLoading(true);
      setError(null);
      const authorizedApps = await walletAPI.listAuthorizedApps();
      setApps(authorizedApps);
    } catch (err) {
      console.error("Failed to load authorized apps:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, [currentNetwork.id, walletAPI]); // Reload when network changes

  const handleRevoke = async (appId: string) => {
    try {
      await walletAPI.revokeAppAuthorizations(appId);
      // Reload apps after revoking
      await loadApps();
    } catch (err) {
      console.error("Failed to revoke app authorizations:", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpdate = async () => {
    // Reload apps after updating
    await loadApps();
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Failed to load authorized apps: {error}</Alert>
      </Box>
    );
  }

  if (apps.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">
          No apps have been authorized yet. When you grant persistent
          authorizations to external applications, they will appear here.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, height: "100%", overflowY: "auto" }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Authorized Apps
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Manage applications that have persistent access to your wallet
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {apps.map((appId) => (
          <AppAuthorizationCard
            key={appId}
            appId={appId}
            onRevoke={handleRevoke}
            onUpdate={handleUpdate}
          />
        ))}
      </Box>
    </Box>
  );
}
