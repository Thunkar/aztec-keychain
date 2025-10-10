import { schemaHasMethod } from "@aztec/foundation/schemas";
import {
  InternalWalletInterfaceSchema,
  type InternalWalletInterface,
} from "../../wallet-internal-proxy";
import { jsonStringify } from "@aztec/foundation/json-rpc";

export class WalletApi {
  private static instance: WalletApi;

  private constructor() {
    return new Proxy(
      {},
      {
        get: (_, prop) => {
          if (schemaHasMethod(InternalWalletInterfaceSchema, prop.toString())) {
            return async (...args: any[]) => {
              const safeArgs = jsonStringify(args);
              const result = await window.walletAPI[prop](safeArgs);
              return InternalWalletInterfaceSchema[
                prop.toString() as keyof InternalWalletInterface
              ]
                .returnType()
                .parseAsync(result);
            };
          } else if (prop.toString() === "onWalletUpdate") {
            return (callback: any) => {
              const safeCallback = (stringifiedEvent: any) => {
                const event = JSON.parse(stringifiedEvent.content);
                callback(event);
              };
              return window.walletAPI.onWalletUpdate(safeCallback);
            };
          } else if (prop.toString() === "onAuthorizationRequest") {
            return (callback: any) => {
              const safeCallback = (stringifiedEvent: any) => {
                const event = JSON.parse(stringifiedEvent.content);
                callback(event);
              };
              return window.walletAPI.onAuthorizationRequest(safeCallback);
            };
          } else {
            throw new Error("Invalid method");
          }
        },
      }
    ) as unknown as InternalWalletInterface;
  }

  static getInstance() {
    if (!WalletApi.instance) {
      WalletApi.instance = new WalletApi();
    }
    return WalletApi.instance as InternalWalletInterface;
  }
}
