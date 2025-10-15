import { AztecAddress } from "@aztec/aztec.js";
import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import AddIcon from "@mui/icons-material/Add";
import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { ContactBox } from "./ContactBox.tsx";
import { WalletContext } from "../../renderer.tsx";
import type { Aliased } from "@aztec/aztec.js";

const INTERACTIONS_PANEL_WIDTH = 400;

export function ContactsManager() {
  const [contacts, setContacts] = useState<Aliased<AztecAddress>[]>([]);
  const [fabPosition, setFabPosition] = useState({
    bottom: 16,
    right: INTERACTIONS_PANEL_WIDTH + 16,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newContactAlias, setNewContactAlias] = useState("");
  const [newContactAddress, setNewContactAddress] = useState("");

  const { walletAPI } = useContext(WalletContext);

  const loadContacts = async () => {
    const senders = await walletAPI.getSenders();
    setContacts(senders);
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const handleFabMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
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

  const handleFabClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDragging) {
      e.preventDefault();
      return;
    }
    setAddDialogOpen(true);
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
      <Fab
        color="primary"
        sx={{
          position: "absolute",
          bottom: fabPosition.bottom,
          right: fabPosition.right,
          cursor: isDragging ? "grabbing" : "grab",
        }}
        onMouseDown={handleFabMouseDown}
        onClick={handleFabClick}
      >
        <AddIcon />
      </Fab>

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
