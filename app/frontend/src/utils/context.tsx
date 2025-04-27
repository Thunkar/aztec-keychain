import { createContext } from "react";
import { Key } from "../components/dataContextContainer";

export const DataContext = createContext<{
  websocketStatus: string;
  keys: Key[];
  generateKeyPair: (index: number) => Promise<void>;
}>({
  websocketStatus: "Uninstantiated",
  keys: [],
  generateKeyPair: (_index: number) => Promise.resolve(),
});
