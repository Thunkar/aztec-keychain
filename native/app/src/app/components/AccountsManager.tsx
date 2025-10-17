import { Fr } from "@aztec/aztec.js";
import { useContext, useEffect, useState, type MouseEvent } from "react";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import AddIcon from "@mui/icons-material/Add";
import Typography from "@mui/material/Typography";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import { randomBytes } from "@aztec/foundation/crypto";
import { AccountBox } from "./AccountBox.tsx";
import { WalletContext } from "../../renderer.tsx";
import type { InternalAccount } from "../../wallet-utils/internal-wallet.ts";

const INTERACTIONS_PANEL_WIDTH = 400;

export function AccountsManager() {
  const [accounts, setAccounts] = useState<InternalAccount[]>([]);
  const [fabPosition, setFabPosition] = useState({
    bottom: 16,
    right: INTERACTIONS_PANEL_WIDTH + 16,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const { walletAPI } = useContext(WalletContext);

  const loadAccounts = async () => {
    const accounts = await walletAPI.getAccounts();
    setAccounts(accounts);
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleFabMouseDown = (e: MouseEvent<HTMLButtonElement>) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - (window.innerWidth - fabPosition.right),
      y: e.clientY - (window.innerHeight - fabPosition.bottom),
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newRight = window.innerWidth - e.clientX + dragOffset.x;
        const newBottom = window.innerHeight - e.clientY + dragOffset.y;
        setFabPosition({
          right: Math.max(16, newRight),
          bottom: Math.max(16, newBottom),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset]);

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
      <Fab
        color="primary"
        sx={{
          position: "absolute",
          bottom: fabPosition.bottom,
          right: fabPosition.right,
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onMouseDown={handleFabMouseDown}
        onClick={async (e) => {
          if (isDragging) {
            e.preventDefault();
            return;
          }
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
        }}
      >
        <AddIcon />
      </Fab>
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
