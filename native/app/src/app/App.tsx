import { AztecAddress, Fr, type Aliased } from "@aztec/aztec.js";
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import AddIcon from "@mui/icons-material/Add";
import { AccountBox } from "./components/AccountBox.tsx";
import { randomBytes } from "@aztec/foundation/crypto";
import { WalletApi } from "./utils/wallet-api.ts";
import type { WalletInteraction } from "../wallet-utils/wallet-interaction.ts";

export function App() {
  const [accounts, setAccounts] = useState<Aliased<AztecAddress>[]>([]);
  const [loading, setLoading] = useState(false);

  const [events, setEvents] = useState<any[]>([]);

  const loadAccounts = async () => {
    const accounts = await WalletApi.getInstance().getAccounts();
    setAccounts(accounts);
  };
  useEffect(() => {
    loadAccounts();
    WalletApi.getInstance().onWalletUpdate((interaction) => {
      console.log(interaction);
      setEvents([...events, interaction]);
    });
  }, []);
  return (
    <Box css={{ display: "flex", flexDirection: "column" }}>
      <h1>Aztec keychain</h1>
      <Box css={{ display: "flex", width: "100%", flexDirection: "column" }}>
        {accounts.map((account, index) => (
          <AccountBox key={index} QRButton account={account} />
        ))}
      </Box>
      <Fab
        color="primary"
        css={{
          position: "absolute",
          bottom: "1rem",
          right: "1rem",
        }}
        onClick={async () => {
          await WalletApi.getInstance().createAccount(
            `ECDSAR1 ${accounts.length}`,
            "ecdsasecp256r1",
            Fr.random(),
            Fr.random(),
            randomBytes(32)
          );
          await loadAccounts();
        }}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
}
