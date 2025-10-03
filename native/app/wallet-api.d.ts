import type { NativeWalletInterface } from "./src/wallet-utils/wallet-internal-proxy.ts";
declare global {
  interface Window {
    walletAPI: NativeWalletInterface;
  }
}
