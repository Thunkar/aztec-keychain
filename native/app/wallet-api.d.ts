import type { NativeWalletInterface } from "./src/wallet-internal-proxy.ts";
declare global {
  interface Window {
    walletAPI: NativeWalletInterface;
  }
}
