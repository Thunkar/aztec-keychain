import type { Aliased, AztecAddress, Fr } from "@aztec/aztec.js";
import { contextBridge, ipcRenderer } from "electron";
import type { TxHash, TxReceipt } from "@aztec/stdlib/tx";
import type { AccountType } from "./wallet-utils/wallet_db";

contextBridge.exposeInMainWorld("walletAPI", {
  getTxReceipt(stringifiedArgs: string): Promise<TxReceipt> {
    return ipcRenderer.invoke("getTxReceipt", stringifiedArgs);
  },
  registerSender(stringifiedArgs: string): Promise<AztecAddress> {
    return ipcRenderer.invoke("registerSender", stringifiedArgs);
  },
  getSenders(): Promise<Aliased<AztecAddress>[]> {
    return ipcRenderer.invoke("getSenders");
  },
  getAccounts(): Promise<Aliased<AztecAddress>[]> {
    return ipcRenderer.invoke("getAccounts");
  },
  createAccount(stringifiedArgs: string): Promise<TxHash> {
    return ipcRenderer.invoke("createAccount", stringifiedArgs);
  },
});
