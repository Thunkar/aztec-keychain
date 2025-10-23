import { schemaHasMethod, type Fr } from "@aztec/foundation/schemas";
import {
  InternalWalletInterfaceSchema,
  type InternalWalletInterface,
} from "../../wallet-internal-proxy";
import { jsonStringify } from "@aztec/foundation/json-rpc";

export class WalletApi {
  private constructor(chainId: Fr, version: Fr) {
    const safeCallback = (callback: any) => (stringifiedEvent: any) => {
      const event = JSON.parse(stringifiedEvent.content);
      callback(event);
    };
    return new Proxy(
      {},
      {
        get: (_, prop) => {
          if (schemaHasMethod(InternalWalletInterfaceSchema, prop.toString())) {
            return async (...args: any[]) => {
              args.unshift(chainId, version);
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
              return window.walletAPI.onWalletUpdate(safeCallback(callback));
            };
          } else if (prop.toString() === "onAuthorizationRequest") {
            return (callback: any) => {
              return window.walletAPI.onAuthorizationRequest(
                safeCallback(callback)
              );
            };
          } else {
            throw new Error(`Invalid method ${prop.toString()}`);
          }
        },
      }
    ) as unknown as InternalWalletInterface;
  }

  static create(chainId: Fr, version: Fr): InternalWalletInterface {
    return new WalletApi(chainId, version) as InternalWalletInterface;
  }
}
