import { AztecAddress } from "@aztec/aztec.js/addresses";
import { type Aliased } from "@aztec/aztec.js/wallet";
import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { ContactBox } from "./components/ContactBox.tsx";
import { DraggableFab } from "../../shared/DraggableFab.tsx";
import { WalletContext } from "../../../renderer";
import { useNetwork } from "../../../contexts/NetworkContext";

export function ContactsManager() {
  const [contacts, setContacts] = useState<Aliased<AztecAddress>[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newContactAlias, setNewContactAlias] = useState("");
  const [newContactAddress, setNewContactAddress] = useState("");

  const { walletAPI } = useContext(WalletContext);
  const { currentNetwork } = useNetwork();

  const loadContacts = async () => {
    const senders = await walletAPI.getAddressBook();
    setContacts(senders);
  };

  useEffect(() => {
    loadContacts();
  }, [currentNetwork.id, walletAPI]); // Reload when network changes

  const handleAddContact = async () => {
    if (!newContactAlias || !newContactAddress) {
      return;
    }

    try {
      const address = AztecAddress.fromString(newContactAddress);
      await walletAPI.registerSender(address, newContactAlias);
      await loadContacts();
      setAddDialogOpen(false);
      setNewContactAlias("");
      setNewContactAddress("");
    } catch (error) {
      console.error("Failed to add contact:", error);
    }
  };

  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="h5" component="h2">
          Contacts
        </Typography>
        <Box
          sx={{
            display: "flex",
            width: "100%",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {contacts.map((contact, index) => (
            <ContactBox key={index} QRButton contact={contact} />
          ))}
        </Box>
      </Box>

      {/* Draggable FAB for adding contacts */}
      <DraggableFab onClick={() => setAddDialogOpen(true)} />

      {/* Add Contact Dialog */}
      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add New Contact</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField
              label="Contact Name"
              value={newContactAlias}
              onChange={(e) => setNewContactAlias(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Aztec Address"
              value={newContactAddress}
              onChange={(e) => setNewContactAddress(e.target.value)}
              fullWidth
              placeholder="0x..."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleAddContact}
            variant="contained"
            disabled={!newContactAlias || !newContactAddress}
          >
            Add Contact
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
