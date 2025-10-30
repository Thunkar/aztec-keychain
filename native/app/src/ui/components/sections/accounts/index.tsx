import { Fr } from "@aztec/aztec.js/fields";
import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { randomBytes } from "@aztec/foundation/crypto";
import { AccountBox } from "./components/AccountBox.tsx";
import { DraggableFab } from "../../shared/DraggableFab.tsx";
import { WalletContext } from "../../../renderer";
import { useNetwork } from "../../../contexts/NetworkContext";
import type { InternalAccount } from "../../../../wallet/core/internal-wallet";

export function AccountsManager() {
  const [accounts, setAccounts] = useState<InternalAccount[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { walletAPI } = useContext(WalletContext);
  const { currentNetwork } = useNetwork();

  const loadAccounts = async () => {
    const accounts = await walletAPI.getAccounts();
    setAccounts(accounts);
  };

  useEffect(() => {
    loadAccounts();
  }, [currentNetwork.id, walletAPI]); // Reload when network changes

  const handleCreateAccount = async () => {
    try {
      await walletAPI.createAccount(
        `ECDSAR1 ${accounts.length}`,
        "ecdsasecp256r1",
        Fr.random(),
        Fr.random(),
        randomBytes(32)
      );
      await loadAccounts();
    } catch (err: any) {
      setError(err.message || "Failed to create account");
    }
  };

  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="h5" component="h2">
          Accounts
        </Typography>
        <Box
          sx={{
            display: "flex",
            width: "100%",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {accounts.map((account, index) => (
            <AccountBox key={index} QRButton account={account} />
          ))}
        </Box>
      </Box>

      {/* Draggable FAB for creating accounts */}
      <DraggableFab onClick={handleCreateAccount} />
      <Snackbar
        open={error !== null}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setError(null)}
          severity="error"
          sx={{ width: "100%" }}
        >
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
