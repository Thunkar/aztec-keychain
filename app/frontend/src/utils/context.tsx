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
  generateAccount: (index: number) => Promise<void>;
}>({
  websocketStatus: "Uninstantiated",
  keyChainStatus: "IDLE",
  currentSignatureRequest: null,
  accounts: [],
  generateAccount: (_index: number) => Promise.resolve(),
});
