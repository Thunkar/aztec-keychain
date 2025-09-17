import type { Aliased, AztecAddress } from "@aztec/aztec.js";
import { contextBridge, ipcRenderer } from "electron";
import type { TxHash, TxReceipt } from "@aztec/stdlib/tx";

contextBridge.exposeInMainWorld("walletAPI", {
  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    return ipcRenderer.invoke("getTxReceipt", [txHash]);
  },
  registerSender(address: AztecAddress, alias?: string): Promise<AztecAddress> {
    return ipcRenderer.invoke("registerSender", [address, alias]);
  },
  getSenders(): Promise<Aliased<AztecAddress>[]> {
    return ipcRenderer.invoke("getSenders");
  },
  getAccounts(): Promise<Aliased<AztecAddress>[]> {
    return ipcRenderer.invoke("getAccounts");
  },
  createAccount(): Promise<TxHash> {
    return ipcRenderer.invoke("createAccount");
  },
});
