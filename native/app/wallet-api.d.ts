import type {
  InternalWalletInterface,
  OnAuthorizationRequestListener,
  OnWalletUpdateListener,
} from "./src/wallet-internal-proxy.ts";
declare global {
  interface Window {
    walletAPI: InternalWalletInterface & {
      onWalletUpdate(callback: OnWalletUpdateListener): void;
      onAuthorizationRequest(callback: OnAuthorizationRequestListener): void;
    };
  }
}
