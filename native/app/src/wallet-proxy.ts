import { generateWalletSchema } from "@aztec/aztec.js";
import type { Wallet } from "@aztec/aztec.js/wallet";
import {
  promiseWithResolvers,
  type PromiseWithResolvers,
} from "@aztec/foundation/promise";
import { schemaHasMethod } from "@aztec/foundation/schemas";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import type { MessagePortMain } from "electron/main";

type FunctionsOf<T> = {
  [K in keyof T as T[K] extends Function ? K : never]: T[K];
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
      get: (target, prop, receiver) => {
        const schema = generateWalletSchema(receiver);
        if (schemaHasMethod(schema, prop.toString())) {
          return async (...args: any[]) => {
            const result = await target.postMessage({
              type: prop.toString() as keyof FunctionsOf<Wallet>,
              args,
            });
            return schema[prop.toString() as keyof typeof schema]
              .returnType()
              .parseAsync(result);
          };
        } else if (prop.toString() === "methods") {
          return () => Object.keys(schema);
        } else {
          return target[prop];
        }
      },
    }) as unknown as Wallet & { methods(): string[] };
  }

  private async postMessage({
    type,
    args,
  }: {
    type: keyof FunctionsOf<Wallet>;
    args: any[];
  }) {
    const messageId = globalThis.crypto.randomUUID();
    this.port.postMessage(jsonStringify({ type, args, messageId }));
    const { promise, resolve, reject } = promiseWithResolvers<any>();
    this.inFlight.set(messageId, { promise, resolve, reject });
    return promise;
  }
}
