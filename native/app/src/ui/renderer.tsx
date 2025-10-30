import { StrictMode, createContext, useMemo } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import {
  createTheme,
  CssBaseline,
  type ThemeOptions,
  ThemeProvider,
} from "@mui/material";
import { colors } from "./styles.js";
import { App } from "../ui/App.js";
import { WalletApi } from "../ui/utils/wallet-api.js";
import type { InternalWalletInterface } from "../ipc/wallet-internal-proxy.js";
import { NetworkProvider, useNetwork } from "./contexts/NetworkContext.js";
import { networkToChainInfo } from "../config/networks.js";

const themeOptions: ThemeOptions = {
  palette: {
    mode: "dark",
    primary: {
      main: colors.primary,
    },
    secondary: {
      main: colors.secondary,
    },
  },
  typography: {
    fontFamily: "monospace",
    subtitle2: {
      color: "darkgrey",
    },
  },
};

const theme = createTheme(themeOptions);

export const WalletContext = createContext<{
  walletAPI: InternalWalletInterface;
}>({ walletAPI: null! });

function WalletProviderWrapper() {
  const { currentNetwork } = useNetwork();
  const chainInfo = networkToChainInfo(currentNetwork);

  // Create wallet API with current network's chain info
  const walletAPI = useMemo(
    () => WalletApi.create(chainInfo.chainId, chainInfo.version),
    [currentNetwork.id] // Recreate when network changes
  );

  const walletContext = useMemo(() => ({ walletAPI }), [walletAPI]);

  return (
    <WalletContext.Provider value={walletContext}>
      <CssBaseline />
      <App />
    </WalletContext.Provider>
  );
}

function Root() {
  return (
    <StrictMode>
      <ThemeProvider theme={theme}>
        <NetworkProvider>
          <WalletProviderWrapper />
        </NetworkProvider>
      </ThemeProvider>
    </StrictMode>
  );
}

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
root.render(<Root />);
