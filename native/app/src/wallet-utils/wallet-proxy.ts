import { TxHash, TxReceipt } from "@aztec/aztec.js";
import { type Wallet, WalletSchema } from "@aztec/aztec.js/wallet";
import {
  promiseWithResolvers,
  type PromiseWithResolvers,
} from "@aztec/foundation/promise";
import { schemaHasMethod } from "@aztec/foundation/schemas";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import type { MessagePortMain } from "electron/main";
import { z } from "zod";
import { schemas, type ApiSchemaFor, optional } from "@aztec/stdlib/schemas";

type FunctionsOf<T> = {
  [K in keyof T as T[K] extends Function ? K : never]: T[K];
};

type NativeWalletInterface = Pick<
  Wallet,
  "getTxReceipt" | "getAccounts" | "getSenders" | "registerSender"
> & {
  createAccount(): Promise<TxHash>;
};

export const NativeWalletInterfaceSchema = {
  ...WalletSchema,
  createAccount: z.function().args().returns(TxHash.schema),
};

export class WalletProxy {
  private inFlight = new Map<string, PromiseWithResolvers<any>>();

  private constructor(private port: MessagePortMain) {}

  static create(port: MessagePortMain) {
    const wallet = new WalletProxy(port);
    port.on("message", async (event) => {
      const { messageId, result, error } = JSON.parse(event.data.content);
      if (!messageId) {
        return;
      }
      if (!wallet.inFlight.has(messageId)) {
        console.error("No in-flight message for id", messageId);
        return;
      }
      const { resolve, reject } = wallet.inFlight.get(messageId);

      if (error) {
        reject(new Error(error));
      } else {
        resolve(result);
      }
      wallet.inFlight.delete(messageId);
    });
    port.start();
    return new Proxy(wallet, {
      get: (target, prop) => {
        if (schemaHasMethod(NativeWalletInterfaceSchema, prop.toString())) {
          return async (...args: any[]) => {
            const result = await target.postMessage({
              type: prop.toString() as keyof FunctionsOf<NativeWallet>,
              args,
            });
            return NativeWalletInterfaceSchema[
              prop.toString() as keyof NativeWalletInterface
            ]
              .returnType()
              .parseAsync(result);
          };
        } else {
          return target[prop];
        }
      },
    }) as unknown as NativeWallet;
  }

  private async postMessage({
    type,
    args,
  }: {
    type: keyof FunctionsOf<NativeWalletInterface>;
    args: any[];
  }) {
    const messageId = globalThis.crypto.randomUUID();
    this.port.postMessage(jsonStringify({ type, args, messageId }));
    const { promise, resolve, reject } = promiseWithResolvers<any>();
    this.inFlight.set(messageId, { promise, resolve, reject });
    return promise;
  }
}
