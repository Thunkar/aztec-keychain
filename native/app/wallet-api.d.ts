import type { NativeWalletInterface } from "./src/wallet-utils/wallet-proxy.ts";
declare global {
  interface Window {
    walletAPI: NativeWalletInterface;
  }
}
