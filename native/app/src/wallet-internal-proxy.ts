import { TxHash, Fr, type ChainInfo } from "@aztec/aztec.js";
import { type Wallet, WalletSchema } from "@aztec/aztec.js/wallet";
import {
  promiseWithResolvers,
  type PromiseWithResolvers,
} from "@aztec/foundation/promise";
import { schemaHasMethod } from "@aztec/foundation/schemas";
import { schemas } from "@aztec/stdlib/schemas";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import type { MessagePortMain } from "electron/main";
import { z } from "zod";
import { type ApiSchemaFor } from "@aztec/stdlib/schemas";
import { AccountTypes, type AccountType } from "./wallet-utils/wallet_db";
import type { WalletInteraction } from "./wallet-utils/wallet-interaction";

type FunctionsOf<T> = {
  [K in keyof T as T[K] extends Function ? K : never]: T[K];
};

export type NativeWalletInterface = Wallet & {
  createAccount(
    alias: string,
    type: AccountType,
    secret: Fr,
    salt: Fr,
    signingKey: Buffer
  ): Promise<TxHash>;
  getInteractions(): Promise<WalletInteraction<any>[]>;
} & EventTarget;

export const NativeWalletInterfaceSchema: ApiSchemaFor<NativeWalletInterface> =
  {
    ...WalletSchema,
    // @ts-ignore Annoying zod error
    createAccount: z
      .function()
      .args(
        z.string(),
        z.enum(AccountTypes),
        schemas.Fr,
        schemas.Fr,
        schemas.Buffer
      )
      .returns(TxHash.schema),
  };

export class WalletInternalProxy {
  private inFlight = new Map<string, PromiseWithResolvers<any>>();

  private constructor(private port: MessagePortMain) {}

  static create(port: MessagePortMain) {
    const wallet = new WalletInternalProxy(port);
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
            return target.postMessage({
              type: prop.toString() as keyof FunctionsOf<NativeWalletInterface>,
              args,
            });
          };
        } else {
          return target[prop];
        }
      },
    }) as unknown as NativeWalletInterface;
  }

  private async postMessage({
    type,
    args,
  }: {
    type: keyof FunctionsOf<NativeWalletInterface>;
    args: any[];
  }) {
    const messageId = globalThis.crypto.randomUUID();
    const chainInfo: ChainInfo = { chainId: new Fr(31337), version: new Fr(1) };
    const appId = "this";
    const message = {
      type,
      args,
      messageId,
      appId,
      chainInfo: jsonStringify(chainInfo),
    };
    this.port.postMessage(message);
    const { promise, resolve, reject } = promiseWithResolvers<any>();
    this.inFlight.set(messageId, { promise, resolve, reject });
    return promise;
  }
}
