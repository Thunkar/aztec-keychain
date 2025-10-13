import type { Aliased, AztecAddress, Fr } from "@aztec/aztec.js";
import { contextBridge, ipcRenderer } from "electron";
import type { TxHash, TxReceipt } from "@aztec/stdlib/tx";
import type {
  WalletInteraction,
  WalletInteractionType,
} from "./wallet-utils/wallet-interaction";

contextBridge.exposeInMainWorld("walletAPI", {
  getTxReceipt(stringifiedArgs: string): Promise<TxReceipt> {
    return ipcRenderer.invoke("getTxReceipt", stringifiedArgs);
  },
  registerSender(stringifiedArgs: string): Promise<AztecAddress> {
    return ipcRenderer.invoke("registerSender", stringifiedArgs);
  },
  getSenders(stringifiedArgs: string): Promise<Aliased<AztecAddress>[]> {
    return ipcRenderer.invoke("getSenders", stringifiedArgs);
  },
  getAccounts(stringifiedArgs: string): Promise<Aliased<AztecAddress>[]> {
    return ipcRenderer.invoke("getAccounts", stringifiedArgs);
  },
  createAccount(stringifiedArgs: string): Promise<TxHash> {
    return ipcRenderer.invoke("createAccount", stringifiedArgs);
  },
  getInteractions(
    stringifiedArgs: string
  ): Promise<WalletInteraction<WalletInteractionType>[]> {
    return ipcRenderer.invoke("getInteractions", stringifiedArgs);
  },
  onWalletUpdate(callback) {
    return ipcRenderer.on("wallet-update", (_event, stringifiedEvent) =>
      callback(stringifiedEvent)
    );
  },
  onAuthorizationRequest(callback) {
    return ipcRenderer.on("authorization-request", (_event, stringifiedEvent) =>
      callback(stringifiedEvent)
    );
  },
  resolveAuthorization(stringifiedArgs: string) {
    return ipcRenderer.invoke("resolveAuthorization", stringifiedArgs);
  },
});
