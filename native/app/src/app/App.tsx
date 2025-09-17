import { AztecAddress, type Aliased } from "@aztec/aztec.js";
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import AddIcon from "@mui/icons-material/Add";
import { AccountBox } from "./components/AccountBox.tsx";

export function App() {
  const [accounts, setAccounts] = useState<Aliased<AztecAddress>>([]);
  const [loading, setLoading] = useState(false);

  const loadAccounts = async () => {
    const accounts = await window.walletAPI.getAccounts();
    setAccounts(accounts);
  };
  useEffect(() => {
    loadAccounts();
  }, []);
  return (
    <Box>
      <h1>Aztec keychain</h1>
      {accounts.map((account, index) => (
        <AccountBox key={index} QRButton account={account} disabled={loading} />
      ))}
      <Fab
        color="primary"
        onClick={async () => {
          await window.walletAPI.createAccount();
          await loadAccounts();
        }}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
}
