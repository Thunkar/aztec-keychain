import { schemaHasMethod } from "@aztec/foundation/schemas";
import {
  NativeWalletInterfaceSchema,
  type NativeWalletInterface,
} from "../../wallet-utils/wallet-proxy";
import { jsonStringify } from "@aztec/foundation/json-rpc";

export class WalletApi {
  private static instance: WalletApi;

  private constructor() {
    return new Proxy(
      {},
      {
        get: (_, prop) => {
          if (schemaHasMethod(NativeWalletInterfaceSchema, prop.toString())) {
            return async (...args: any[]) => {
              const safeArgs = jsonStringify(args);
              const result = await window.walletAPI[prop](safeArgs);
              return NativeWalletInterfaceSchema[
                prop.toString() as keyof NativeWalletInterface
              ]
                .returnType()
                .parseAsync(result);
            };
          } else {
            throw new Error("Invalid method");
          }
        },
      }
    ) as unknown as NativeWalletInterface;
  }

  static getInstance() {
    if (!WalletApi.instance) {
      WalletApi.instance = new WalletApi();
    }
    return WalletApi.instance as NativeWalletInterface;
  }
}
