import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import Typography from "@mui/material/Typography";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import { InteractionsList } from "./components/InteractionsList.tsx";
import { AccountsManager } from "./components/AccountsManager.tsx";

import { WalletContext } from "../renderer.tsx";
import type {
  WalletInteraction,
  WalletInteractionType,
} from "../wallet-utils/wallet-interaction.ts";

const INTERACTIONS_PANEL_WIDTH = 400;
const MENU_DRAWER_WIDTH = 240;

type MenuSection = "accounts";

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState<MenuSection>("accounts");

  const [events, setEvents] = useState<
    WalletInteraction<WalletInteractionType>[]
  >([]);

  const { walletAPI } = useContext(WalletContext);

  const loadInteractions = async () => {
    const interactions = await walletAPI.getInteractions();
    setEvents(interactions);
  };

  useEffect(() => {
    loadInteractions();
    walletAPI.onWalletUpdate((interaction) => {
      console.log(interaction);
      setEvents((prevEvents) => {
        // Deduplicate by ID to prevent React strict mode duplicates
        const eventsMap = new Map(prevEvents.map((e) => [e.id, e]));
        eventsMap.set(interaction.id, interaction);
        return Array.from(eventsMap.values());
      });
    });
  }, []);

  const handleMenuToggle = () => {
    setMenuOpen(!menuOpen);
  };

  const handleMenuItemClick = (section: MenuSection) => {
    setCurrentSection(section);
    setMenuOpen(false);
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
      {/* Main Content Area with App Bar */}
      <Box
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* App Bar with Hamburger Menu */}
        <AppBar position="static">
          <Toolbar>
            <IconButton
              color="inherit"
              aria-label="open menu"
              edge="start"
              onClick={handleMenuToggle}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
              Aztec Keychain
            </Typography>
          </Toolbar>
        </AppBar>

        {/* Navigation Drawer (Left Side) */}
        <Drawer
          anchor="left"
          open={menuOpen}
          onClose={handleMenuToggle}
          sx={{
            "& .MuiDrawer-paper": {
              width: MENU_DRAWER_WIDTH,
            },
          }}
        >
          <Toolbar />
          <Box sx={{ overflowY: "auto" }}>
            <List>
              <ListItem disablePadding>
                <ListItemButton
                  selected={currentSection === "accounts"}
                  onClick={() => handleMenuItemClick("accounts")}
                >
                  <ListItemIcon>
                    <AccountBalanceWalletIcon />
                  </ListItemIcon>
                  <ListItemText primary="Accounts" />
                </ListItemButton>
              </ListItem>
            </List>
          </Box>
        </Drawer>

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
    </Box>
  );
}
