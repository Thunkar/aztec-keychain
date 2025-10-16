import { StrictMode, createContext } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import {
  createTheme,
  CssBaseline,
  type ThemeOptions,
  ThemeProvider,
} from "@mui/material";
import { colors } from "./styles.js";
import { App } from "./app/App.js";
import { WalletApi } from "./app/utils/wallet-api.js";
import type { InternalWalletInterface } from "./wallet-internal-proxy.js";
import { Fr } from "@aztec/aztec.js";

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

function Root() {
  const walletAPI = WalletApi.create(new Fr(31337), new Fr(1681471542));
  const initialContext = {
    walletAPI,
  };
  return (
    <StrictMode>
      <ThemeProvider theme={theme}>
        <WalletContext.Provider value={initialContext}>
          <CssBaseline />
          <App />
        </WalletContext.Provider>
      </ThemeProvider>
    </StrictMode>
  );
}

const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
root.render(<Root />);
