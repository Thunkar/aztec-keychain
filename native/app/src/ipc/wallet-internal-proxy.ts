import { Fr } from "@aztec/aztec.js/fields";
import { type Wallet, WalletSchema } from "@aztec/aztec.js/wallet";
import {
  promiseWithResolvers,
  type PromiseWithResolvers,
} from "@aztec/foundation/promise";
import { schemaHasMethod } from "@aztec/foundation/schemas";
import { schemas } from "@aztec/stdlib/schemas";
import type { MessagePortMain } from "electron/main";
import { z } from "zod";
import { type ApiSchemaFor } from "@aztec/stdlib/schemas";
import { AccountTypes, type AccountType } from "../wallet/database/wallet-db";
import type {
  WalletInteraction,
  WalletInteractionType,
} from "../wallet/types/wallet-interaction";
import { WalletInteractionSchema } from "../wallet/types/wallet-interaction";
import type {
  AuthorizationRequest,
  AuthorizationResponse,
} from "../wallet/types/authorization";
import type { InternalAccount } from "../wallet/core/internal-wallet";
import type { DecodedExecutionTrace } from "../wallet/decoding/tx-callstack-decoder";

type FunctionsOf<T> = {
  [K in keyof T as T[K] extends Function ? K : never]: T[K];
};

type OnWalletUpdateListener = (interaction: WalletInteraction<any>) => void;
type OnAuthorizationRequestListener = (request: AuthorizationRequest) => void;

// Zod schema for execution trace components
const ContractInfoSchema = z.object({
  name: z.string(),
  address: z.string(),
});

const ArgValueSchema = z.object({
  name: z.string(),
  value: z.string(),
});

const PublicEnqueueEventSchema: z.ZodType<any> = z.object({
  type: z.literal("public-enqueue"),
  depth: z.number(),
  counter: z.number(),
  contract: ContractInfoSchema,
  function: z.string(),
  caller: ContractInfoSchema,
  isStaticCall: z.boolean(),
});

const PrivateCallEventSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.literal("private-call"),
    depth: z.number(),
    counter: z.object({
      start: z.number(),
      end: z.number(),
    }),
    contract: ContractInfoSchema,
    function: z.string(),
    caller: ContractInfoSchema,
    isStaticCall: z.boolean(),
    args: z.array(ArgValueSchema),
    returnValues: z.array(ArgValueSchema),
    nestedEvents: z.array(
      z.union([PrivateCallEventSchema, PublicEnqueueEventSchema])
    ),
  })
);

const DecodedExecutionTraceSchema = z.union([
  // Full transaction trace
  z.object({
    privateExecution: PrivateCallEventSchema,
    publicExecutionQueue: z.array(PublicEnqueueEventSchema),
  }),
  // Simplified utility trace
  z.object({
    functionName: z.string(),
    args: z.any(),
    contractAddress: z.string(),
    contractName: z.string(),
    result: z.any(),
    isUtility: z.literal(true),
  }),
]);

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
  getExecutionTrace(
    interactionId: string
  ): Promise<DecodedExecutionTrace | undefined>;
  resolveAuthorization(response: AuthorizationResponse): void;
  onWalletUpdate(callback: OnWalletUpdateListener): void;
  onAuthorizationRequest(callback: OnAuthorizationRequestListener): void;
  // App authorization management
  listAuthorizedApps(): Promise<string[]>;
  getAppAuthorizations(appId: string): Promise<{
    accounts: { alias: string; item: string }[];
    simulations: Array<{
      type: "simulateTx" | "simulateUtility";
      payloadHash: string;
      title?: string;
      key: string;
    }>;
    otherMethods: string[];
  }>;
  updateAccountAuthorization(
    appId: string,
    accounts: { alias: string; item: string }[]
  ): Promise<void>;
  revokeAuthorization(key: string): Promise<void>;
  revokeAppAuthorizations(appId: string): Promise<void>;
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
    getExecutionTrace: z
      .function()
      .args(z.string())
      .returns(DecodedExecutionTraceSchema.optional()),
    // @ts-ignore
    resolveAuthorization: z.function().args(
      z.object({
        id: z.string(),
        approved: z.boolean(),
        appId: z.string(),
        itemResponses: z.record(z.any()),
      })
    ),
    // App authorization management
    listAuthorizedApps: z.function().args().returns(z.array(z.string())),
    // @ts-ignore
    getAppAuthorizations: z
      .function()
      .args(z.string())
      .returns(
        z.object({
          accounts: z.array(z.object({ alias: z.string(), item: z.string() })),
          simulations: z.array(
            z.object({
              type: z.enum(["simulateTx", "simulateUtility"]),
              payloadHash: z.string(),
              title: z.string().optional(),
              key: z.string(),
            })
          ),
          otherMethods: z.array(z.string()),
        })
      ),
    // @ts-ignore
    updateAccountAuthorization: z
      .function()
      .args(
        z.string(),
        z.array(z.object({ alias: z.string(), item: z.string() }))
      ),
    // @ts-ignore
    revokeAuthorization: z.function().args(z.string()),
    // @ts-ignore
    revokeAppAuthorizations: z.function().args(z.string()),
  };

export class WalletInternalProxy {
  private inFlight = new Map<string, PromiseWithResolvers<any>>();
  private internalEventCallback!: OnWalletUpdateListener;
  private authRequestCallback!: OnAuthorizationRequestListener;

  private constructor(private internalPort: MessagePortMain) {}

  public onWalletUpdate(callback: OnWalletUpdateListener) {
    this.internalEventCallback = callback;
  }

  public onAuthorizationRequest(callback: OnAuthorizationRequestListener) {
    this.authRequestCallback = callback;
  }

  static create(internalPort: MessagePortMain) {
    const wallet = new WalletInternalProxy(internalPort);
    internalPort.on("message", async (event) => {
      const { type, content } = event.data;

      // Handle typed events
      if (type === "authorization-request") {
        wallet.authRequestCallback?.(event.data);
        return;
      }

      if (type === "wallet-update") {
        wallet.internalEventCallback?.(event.data);
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
    internalPort.start();
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
    const appId = "this";
    const [chainId, version, ...originaArgs] = args;
    const message = {
      type,
      args: originaArgs,
      messageId,
      appId,
      chainInfo: { chainId, version },
    };
    this.internalPort.postMessage(message);
    const { promise, resolve, reject } = promiseWithResolvers<any>();
    this.inFlight.set(messageId, { promise, resolve, reject });
    return promise;
  }
}
