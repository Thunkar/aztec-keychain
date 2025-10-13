import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import { InteractionsList } from "./components/InteractionsList.tsx";
import { AccountsManager } from "./components/AccountsManager.tsx";

import { WalletContext } from "../renderer.tsx";
import type {
  WalletInteraction,
  WalletInteractionType,
} from "../wallet-utils/wallet-interaction.ts";
import type { AuthorizationRequest } from "../wallet-utils/authorization.ts";

const INTERACTIONS_PANEL_WIDTH = 400;
const MENU_DRAWER_WIDTH = 240;
const SIDEBAR_WIDTH = 64;

type MenuSection = "accounts";

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState<MenuSection>("accounts");

  const [events, setEvents] = useState<
    WalletInteraction<WalletInteractionType>[]
  >([]);

  const [pendingAuth, setPendingAuth] = useState<AuthorizationRequest | null>(
    null
  );

  const { walletAPI } = useContext(WalletContext);

  const loadInteractions = async () => {
    const interactions = await walletAPI.getInteractions();
    setEvents(interactions);
  };

  useEffect(() => {
    loadInteractions();
    walletAPI.onWalletUpdate((interaction) => {
      setEvents((prevEvents) => {
        // Deduplicate by ID to prevent React strict mode duplicates
        const eventsMap = new Map(prevEvents.map((e) => [e.id, e]));
        eventsMap.set(interaction.id, interaction);
        return Array.from(eventsMap.values());
      });
    });

    // Listen for authorization requests from external dApps
    walletAPI.onAuthorizationRequest((request: AuthorizationRequest) => {
      console.log(request);
      setPendingAuth(request);
    });
  }, []);

  const handleMenuToggle = () => {
    setMenuOpen(!menuOpen);
  };

  const handleMenuItemClick = (section: MenuSection) => {
    setCurrentSection(section);
    setMenuOpen(false);
  };

  const handleAuthApprove = () => {
    if (pendingAuth) {
      walletAPI.resolveAuthorization({
        id: pendingAuth.id,
        approved: true,
        appId: pendingAuth.appId, // Include the appId of the dApp
      });
      setPendingAuth(null);
    }
  };

  const handleAuthDeny = () => {
    if (pendingAuth) {
      walletAPI.resolveAuthorization({
        id: pendingAuth.id,
        approved: false,
        appId: pendingAuth.appId, // Include the appId of the dApp
      });
      setPendingAuth(null);
    }
  };

  const renderContent = () => {
    switch (currentSection) {
      case "accounts":
        return <AccountsManager />;
      default:
        return null;
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        overflow: "hidden",
        width: "100%",
      }}
    >
      {/* Combined Sidebar - Expands when menu opens */}
      <Box
        sx={{
          width: menuOpen ? SIDEBAR_WIDTH + MENU_DRAWER_WIDTH : SIDEBAR_WIDTH,
          flexShrink: 0,
          borderRight: 1,
          borderColor: "divider",
          display: "flex",
          bgcolor: "background.paper",
          transition: "width 225ms cubic-bezier(0.4, 0, 0.6, 1)",
          overflow: "hidden",
        }}
      >
        {/* Icon Sidebar - Always visible */}
        <Box
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            borderRight: menuOpen ? 1 : 0,
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              height: 64,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <IconButton
              color="primary"
              aria-label="open menu"
              onClick={handleMenuToggle}
            >
              <MenuIcon />
            </IconButton>
          </Box>
          <List sx={{ p: 0 }}>
            <ListItem disablePadding>
              <ListItemButton
                selected={currentSection === "accounts"}
                onClick={() => handleMenuItemClick("accounts")}
                sx={{
                  flexDirection: "column",
                  py: 2,
                  minHeight: SIDEBAR_WIDTH,
                }}
              >
                <AccountBalanceWalletIcon />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>

        {/* Expanded Menu Content */}
        <Box
          sx={{
            width: MENU_DRAWER_WIDTH,
            display: "flex",
            flexDirection: "column",
            opacity: menuOpen ? 1 : 0,
            transition: "opacity 225ms cubic-bezier(0.4, 0, 0.6, 1)",
          }}
        >
          <Box
            sx={{
              height: 64,
              display: "flex",
              alignItems: "center",
              px: 2,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="h6">Menu</Typography>
          </Box>
          <Box sx={{ overflowY: "auto" }}>
            <List>
              <ListItem disablePadding>
                <ListItemButton
                  sx={{ height: 64 }}
                  selected={currentSection === "accounts"}
                  onClick={() => handleMenuItemClick("accounts")}
                >
                  <ListItemText primary="Accounts" />
                </ListItemButton>
              </ListItem>
            </List>
          </Box>
        </Box>
      </Box>

      {/* Main Content Area with App Bar */}
      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* App Bar */}
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
              Aztec Keychain
            </Typography>
          </Toolbar>
        </AppBar>

        {/* Main Content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            overflow: "hidden",
            width: "100%",
            display: "flex",
          }}
        >
          {renderContent()}
        </Box>
      </Box>

      {/* Fixed Right Interactions Panel */}
      <Box
        sx={{
          width: INTERACTIONS_PANEL_WIDTH,
          flexShrink: 0,
          borderLeft: 1,
          borderColor: "divider",
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper",
        }}
      >
        <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="h6" component="h2">
            Interactions
          </Typography>
        </Box>
        <Box sx={{ flexGrow: 1, overflow: "hidden" }}>
          <InteractionsList interactions={events} />
        </Box>
      </Box>

      {/* Authorization Dialog */}
      {pendingAuth && (
        <Dialog open={true} maxWidth="sm" fullWidth>
          <DialogTitle>Authorization Request</DialogTitle>
          <DialogContent>
            <Typography variant="body1" gutterBottom>
              App <strong>{pendingAuth.appId}</strong> requests:
            </Typography>
            <Typography variant="h6" gutterBottom>
              {pendingAuth.method}
            </Typography>
            <Box
              sx={{
                mt: 2,
                p: 2,
                bgcolor: "background.default",
                borderRadius: 1,
                maxHeight: 300,
                overflow: "auto",
              }}
            >
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(pendingAuth.params, null, 2)}
              </pre>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleAuthDeny} color="error">
              Deny
            </Button>
            <Button
              onClick={() => handleAuthApprove()}
              color="primary"
              variant="contained"
            >
              Approve
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
