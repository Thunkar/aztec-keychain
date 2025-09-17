import type { NativeWallet } from "./src/wallet-utils/wallet-proxy.ts";
declare global {
  interface Window {
    walletAPI: NativeWallet;
  }
}
