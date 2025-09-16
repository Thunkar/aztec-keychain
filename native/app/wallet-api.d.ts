import type { Wallet } from "@aztec/aztec.js";

declare global {
  interface Window {
    walletAPI: Wallet;
  }
}
