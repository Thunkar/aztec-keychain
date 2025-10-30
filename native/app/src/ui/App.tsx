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
import ContactsIcon from "@mui/icons-material/Contacts";
import AppsIcon from "@mui/icons-material/Apps";
import { InteractionsList } from "./components/sections/interactions/index.tsx";
import { AccountsManager } from "./components/sections/accounts/index.tsx";
import { ContactsManager } from "./components/sections/contacts/index.tsx";
import { AuthorizedApps } from "./components/sections/authorized-apps/index.tsx";
import { AuthorizationDialog } from "./components/dialogs/AuthorizationDialog.tsx";
import { NetworkSelector } from "./components/NetworkSelector.tsx";

import type {
  WalletInteraction,
  WalletInteractionType,
} from "../wallet/types/wallet-interaction.ts";
import type { AuthorizationRequest } from "../wallet/types/authorization.ts";
import { WalletContext } from "./renderer.tsx";
import { useNetwork } from "./contexts/NetworkContext.tsx";

const INTERACTIONS_PANEL_WIDTH = 400;
const INTERACTIONS_PANEL_MIN_WIDTH = 300;
const INTERACTIONS_PANEL_MAX_WIDTH = 800;
const MENU_DRAWER_WIDTH = 240;
const SIDEBAR_WIDTH = 64;

type MenuSection = "accounts" | "contacts" | "apps";

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState<MenuSection>("accounts");
  const [interactionsPanelWidth, setInteractionsPanelWidth] = useState(
    INTERACTIONS_PANEL_WIDTH
  );
  const [isResizing, setIsResizing] = useState(false);

  const [interactions, setInteractions] = useState<
    WalletInteraction<WalletInteractionType>[]
  >([]);
  const [selectedInteractionTypes, setSelectedInteractionTypes] = useState<
    WalletInteractionType[]
  >([
    "registerContract",
    "createAccount",
    "simulateTx",
    "simulateUtility",
    "sendTx",
    "profileTx",
  ]);

  const [authQueue, setAuthQueue] = useState<AuthorizationRequest[]>([]);
  const currentAuth = authQueue[0] || null;

  const { walletAPI } = useContext(WalletContext);
  const { currentNetwork } = useNetwork();

  const loadInteractions = async () => {
    const interactions = await walletAPI.getInteractions();
    setInteractions(interactions);
  };

  useEffect(() => {
    // Clear state when network changes
    setInteractions([]);
    setAuthQueue([]);

    loadInteractions();
    walletAPI.onWalletUpdate((interaction) => {
      setInteractions((prevEvents) => {
        // Deduplicate by ID to prevent React strict mode duplicates
        const eventsMap = new Map<
          string,
          WalletInteraction<WalletInteractionType>
        >(prevEvents.map((e) => [e.id, e]));
        eventsMap.set(interaction.id, interaction);
        return Array.from(eventsMap.values()).sort(
          (a, b) => b.timestamp - a.timestamp
        );
      });
    });

    // Listen for authorization requests from external dApps
    walletAPI.onAuthorizationRequest((request: AuthorizationRequest) => {
      console.log("New authorization request:", request);
      setAuthQueue((prev) => {
        // Deduplicate by ID to prevent React strict mode duplicates
        if (prev.some((req) => req.id === request.id)) {
          return prev;
        }
        return [...prev, request];
      });
    });
  }, [currentNetwork.id, walletAPI]); // Reload when network changes

  const handleMenuToggle = () => {
    setMenuOpen(!menuOpen);
  };

  const handleMenuItemClick = (section: MenuSection) => {
    setCurrentSection(section);
    setMenuOpen(false);
  };

  const handleAuthApprove = (itemResponses: Record<string, any>) => {
    if (currentAuth) {
      walletAPI.resolveAuthorization({
        id: currentAuth.id,
        approved: true,
        appId: currentAuth.appId,
        itemResponses,
      });
      // Remove the processed request from the queue
      setAuthQueue((prev) => prev.slice(1));
    }
  };

  const handleAuthDeny = () => {
    if (currentAuth) {
      // Create denied responses for all items
      const itemResponses: Record<string, any> = {};
      for (const item of currentAuth.items) {
        itemResponses[item.id] = {
          id: item.id,
          approved: false,
          appId: item.appId,
        };
      }

      walletAPI.resolveAuthorization({
        id: currentAuth.id,
        approved: false,
        appId: currentAuth.appId,
        itemResponses,
      });
      // Remove the processed request from the queue
      setAuthQueue((prev) => prev.slice(1));
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = window.innerWidth - e.clientX;
      if (
        newWidth >= INTERACTIONS_PANEL_MIN_WIDTH &&
        newWidth <= INTERACTIONS_PANEL_MAX_WIDTH
      ) {
        setInteractionsPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const renderContent = () => {
    switch (currentSection) {
      case "accounts":
        return <AccountsManager />;
      case "contacts":
        return <ContactsManager />;
      case "apps":
        return <AuthorizedApps />;
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
        cursor: isResizing ? "col-resize" : "default",
        userSelect: isResizing ? "none" : "auto",
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
            <ListItem disablePadding>
              <ListItemButton
                selected={currentSection === "contacts"}
                onClick={() => handleMenuItemClick("contacts")}
                sx={{
                  flexDirection: "column",
                  py: 2,
                  minHeight: SIDEBAR_WIDTH,
                }}
              >
                <ContactsIcon />
              </ListItemButton>
            </ListItem>
            <ListItem disablePadding>
              <ListItemButton
                selected={currentSection === "apps"}
                onClick={() => handleMenuItemClick("apps")}
                sx={{
                  flexDirection: "column",
                  py: 2,
                  minHeight: SIDEBAR_WIDTH,
                }}
              >
                <AppsIcon />
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
            <List sx={{ padding: 0 }}>
              <ListItem disablePadding>
                <ListItemButton
                  sx={{ height: 64 }}
                  selected={currentSection === "accounts"}
                  onClick={() => handleMenuItemClick("accounts")}
                >
                  <ListItemText primary="Accounts" />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding>
                <ListItemButton
                  sx={{ height: 64 }}
                  selected={currentSection === "contacts"}
                  onClick={() => handleMenuItemClick("contacts")}
                >
                  <ListItemText primary="Contacts" />
                </ListItemButton>
              </ListItem>
              <ListItem disablePadding>
                <ListItemButton
                  sx={{ height: 64 }}
                  selected={currentSection === "apps"}
                  onClick={() => handleMenuItemClick("apps")}
                >
                  <ListItemText primary="Apps" />
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
            <NetworkSelector />
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
          width: interactionsPanelWidth,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper",
          position: "relative",
        }}
      >
        {/* Resize Handle */}
        <Box
          onMouseDown={handleMouseDown}
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            cursor: "col-resize",
            bgcolor: "divider",
            transition: "background-color 0.2s",
            "&:hover": {
              bgcolor: "primary.main",
            },
            ...(isResizing && {
              bgcolor: "primary.main",
            }),
          }}
        />
        <Box
          sx={{ p: 2, borderBottom: 1, borderColor: "divider", borderLeft: 1 }}
        >
          <Typography variant="h6" component="h2">
            Interactions
          </Typography>
        </Box>
        <Box
          sx={{
            flexGrow: 1,
            overflow: "auto",
            borderLeft: 1,
            borderColor: "divider",
          }}
        >
          <InteractionsList
            interactions={interactions}
            selectedTypes={selectedInteractionTypes}
            onTypeFilterChange={setSelectedInteractionTypes}
          />
        </Box>
      </Box>

      {/* Authorization Dialog - All requests are now batches */}
      {currentAuth && (
        <AuthorizationDialog
          request={currentAuth}
          onApprove={handleAuthApprove}
          onDeny={handleAuthDeny}
          queueLength={authQueue.length}
        />
      )}
    </Box>
  );
}
