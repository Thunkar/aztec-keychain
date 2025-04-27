import { createContext } from "react";
import {
  CurrentSignatureRequest,
  Key,
} from "../components/DataContextContainer";

export const DataContext = createContext<{
  websocketStatus: string;
  keys: Key[];
  keyChainStatus: string;
  currentSignatureRequest: CurrentSignatureRequest | null;
  generateKeyPair: (index: number) => Promise<void>;
}>({
  websocketStatus: "Uninstantiated",
  keyChainStatus: "IDLE",
  currentSignatureRequest: null,
  keys: [],
  generateKeyPair: (_index: number) => Promise.resolve(),
});
