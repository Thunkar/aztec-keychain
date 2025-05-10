import { createContext } from "react";
import {
  Account,
  CurrentSignatureRequest,
} from "../components/DataContextContainer";

export const DataContext = createContext<{
  websocketStatus: string;
  accounts: Account[];
  keyChainStatus: string;
  currentSignatureRequest: CurrentSignatureRequest | null;
  SSID: string;
  password: string;
  initialized: boolean;
  storeSettings: (SSID: string, password: string) => Promise<void>;
  generateAccount: (index: number) => Promise<void>;
  selectAccount: (index: number) => Promise<void>;
}>({
  websocketStatus: "Uninstantiated",
  keyChainStatus: "IDLE",
  currentSignatureRequest: null,
  accounts: [],
  SSID: "",
  password: "",
  initialized: false,
  storeSettings: (_SSID: string, _password: string) => Promise.resolve(),
  generateAccount: (_index: number) => Promise.resolve(),
  selectAccount: (_index: number) => Promise.resolve(),
});
