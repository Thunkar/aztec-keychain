import { AztecAddress, Fr, type Aliased } from "@aztec/aztec.js";
import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import AddIcon from "@mui/icons-material/Add";
import { AccountBox } from "./components/AccountBox.tsx";
import { InteractionsList } from "./components/InteractionsList.tsx";
import { randomBytes } from "@aztec/foundation/crypto";

import { WalletContext } from "../renderer.tsx";
import type { WalletInteraction, WalletInteractionType } from "../wallet-utils/wallet-interaction.ts";

export function App() {
  const [accounts, setAccounts] = useState<Aliased<AztecAddress>[]>([]);
  const [loading, setLoading] = useState(false);

  const [events, setEvents] = useState<WalletInteraction<WalletInteractionType>[]>([]);

  const { walletAPI } = useContext(WalletContext);

  const loadAccounts = async () => {
    const accounts = await walletAPI.getAccounts();
    setAccounts(accounts);
  };

  const loadInteractions = async () => {
    const interactions = await walletAPI.getInteractions();
    setEvents(interactions);
  };

  useEffect(() => {
    loadAccounts();
    loadInteractions();
    walletAPI.onWalletUpdate((interaction) => {
      console.log(interaction);
      setEvents((prevEvents) => {
        // Deduplicate by ID to prevent React strict mode duplicates
        const eventsMap = new Map(prevEvents.map(e => [e.id, e]));
        eventsMap.set(interaction.id, interaction);
        return Array.from(eventsMap.values());
      });
    });
  }, []);
  return (
    <Box css={{ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1rem" }}>
      <h1>Aztec keychain</h1>
      <Box css={{ display: "flex", width: "100%", flexDirection: "column" }}>
        {accounts.map((account, index) => (
          <AccountBox key={index} QRButton account={account} />
        ))}
      </Box>
      <Box css={{ display: "flex", flexDirection: "column" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Interactions</h2>
        <InteractionsList interactions={events} />
      </Box>
      <Fab
        color="primary"
        css={{
          position: "absolute",
          bottom: "1rem",
          right: "1rem",
        }}
        onClick={async () => {
          await walletAPI.createAccount(
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
