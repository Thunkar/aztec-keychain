import { Fr, type ChainInfo } from "@aztec/aztec.js";
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
import type {
  WalletInteraction,
  WalletInteractionType,
} from "./wallet-utils/wallet-interaction";
import { WalletInteractionSchema } from "./wallet-utils/wallet-interaction";
import type {
  AuthorizationRequest,
  AuthorizationResponse,
  InternalAccount,
} from "./wallet-utils/native-wallet";

type FunctionsOf<T> = {
  [K in keyof T as T[K] extends Function ? K : never]: T[K];
};

export type OnWalletUpdateListener = (
  interaction: WalletInteraction<any>
) => void;
export type OnAuthorizationRequestListener = (
  request: AuthorizationRequest
) => void;

// Internal wallet interface - extends external with internal-only methods
export type InternalWalletInterface = Omit<Wallet, "getAccounts"> & {
  createAccount(
    alias: string,
    type: AccountType,
    secret: Fr,
    salt: Fr,
    signingKey: Buffer
  ): Promise<void>;
  getAccounts(): Promise<InternalAccount[]>; // Override with enriched type
  getInteractions(): Promise<WalletInteraction<WalletInteractionType>[]>;
  resolveAuthorization(response: AuthorizationResponse): void;
};

export const InternalWalletInterfaceSchema: ApiSchemaFor<InternalWalletInterface> =
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
      ),
    // @ts-ignore - Type inference for enriched InternalAccount with type field
    getAccounts: z
      .function()
      .args()
      .returns(
        z.array(
          z.object({
            alias: z.string(),
            item: schemas.AztecAddress,
            type: z.enum(AccountTypes),
          })
        )
      ),
    getInteractions: z
      .function()
      .args()
      .returns(z.array(WalletInteractionSchema)),
    // @ts-ignore
    resolveAuthorization: z
      .function()
      .args(z.object({ id: z.string(), approved: z.boolean() })),
  };

export class WalletInternalProxy {
  private inFlight = new Map<string, PromiseWithResolvers<any>>();
  private internalEventCallback!: OnWalletUpdateListener;
  private authRequestCallback!: OnAuthorizationRequestListener;

  private constructor(private port: MessagePortMain) {}

  public onWalletUpdate(callback: OnWalletUpdateListener) {
    this.internalEventCallback = callback;
  }

  public onAuthorizationRequest(callback: OnAuthorizationRequestListener) {
    this.authRequestCallback = callback;
  }

  static create(port: MessagePortMain) {
    const wallet = new WalletInternalProxy(port);
    port.on("message", async (event) => {
      const { type, content } = event.data;

      // Handle authorization requests
      if (type === "authorization-request") {
        const authRequest = JSON.parse(content);
        wallet.authRequestCallback?.(authRequest);
        return;
      }

      if (type === "wallet-update") {
        wallet.internalEventCallback?.(JSON.parse(content));
        return;
      }

      const { messageId, result, error } = JSON.parse(content);

      if (!wallet.inFlight.has(messageId)) {
        console.error("No in-flight message for id", messageId);
        return;
      }
      const { resolve, reject } = wallet.inFlight.get(messageId)!;

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
        if (schemaHasMethod(InternalWalletInterfaceSchema, prop.toString())) {
          return async (...args: any[]) => {
            return target.postMessage({
              type: prop.toString() as keyof FunctionsOf<InternalWalletInterface>,
              args,
            });
          };
        } else {
          return target[prop];
        }
      },
    }) as unknown as InternalWalletInterface;
  }

  private async postMessage({
    type,
    args,
  }: {
    type: keyof FunctionsOf<InternalWalletInterface>;
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
