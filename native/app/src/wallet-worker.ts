import {
  createAztecNodeClient,
  WalletSchema,
  type ChainInfo,
} from "@aztec/aztec.js";
import { parseWithOptionals, schemaHasMethod } from "@aztec/foundation/schemas";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import type { MessagePortMain } from "electron";
import { ExternalWallet } from "./wallet-utils/external-wallet.ts";
import { InternalWalletInterfaceSchema } from "./wallet-internal-proxy.ts";
import { createPXE, getPXEConfig } from "@aztec/pxe/server";
import { schemas } from "@aztec/stdlib/schemas";

import { createStore } from "@aztec/kv-store/lmdb-v2";
import { resolve, join } from "node:path";
import { createProxyLogger } from "./wallet-utils/logger";
import { WalletDB } from "./wallet-utils/wallet_db.ts";
import { z } from "zod";
import { homedir } from "node:os";
import { inspect } from "node:util";
import type { PromiseWithResolvers } from "@aztec/foundation/promise";
import type {
  AuthorizationRequest,
  AuthorizationResponse,
} from "./wallet-utils/authorization.ts";
import type { Logger } from "pino";
import { InternalWallet } from "./wallet-utils/internal-wallet.ts";

const ChainInfoSchema = z.object({
  chainId: schemas.Fr,
  version: schemas.Fr,
});

const chainInfoToNodeURL = {
  31337: {
    1681471542: "http://localhost:8080",
  },
  1115111: {
    1714840162: "https://rpc.testnet.aztec-labs.com/",
  },
};

const RUNNING_SESSIONS = new Map<
  string,
  Map<string, Promise<{ external: ExternalWallet; internal: InternalWallet }>>
>();

async function init(
  chainInfo: ChainInfo,
  appId: string,
  internalPort: MessagePortMain,
  logPort: MessagePortMain
) {
  const nodeURL =
    typeof chainInfoToNodeURL[chainInfo.chainId.toNumber()] === "string"
      ? chainInfoToNodeURL[chainInfo.chainId.toNumber()]
      : chainInfoToNodeURL[chainInfo.chainId.toNumber()][
          chainInfo.version.toNumber()
        ];
  const sessionId = `${chainInfo.chainId.toNumber()}-${chainInfo.version.toNumber()}`;
  if (!RUNNING_SESSIONS.get(appId)?.has(sessionId)) {
    const internalInit = async () => {
      const node = createAztecNodeClient(nodeURL);

      const l1Contracts = await node.getL1ContractAddresses();

      const rollupAddress = l1Contracts.rollupAddress;

      const keychainHomeDir = join(homedir(), "keychain");

      const configOverrides = {
        dataDirectory: resolve(keychainHomeDir, `./pxe-${rollupAddress}`),
        proverEnabled: false,
      };
      const options = {
        loggers: {
          store: createProxyLogger("pxe:data:lmdb", logPort),
          pxe: createProxyLogger("pxe:service", logPort),
          prover: createProxyLogger("bb:native", logPort),
        },
        store: await createStore(
          "pxe_data",
          2,
          {
            dataDirectory: configOverrides.dataDirectory,
            dataStoreMapSizeKB: 2e10,
          },
          createProxyLogger("pxe:data:lmdb", logPort)
        ),
      };

      const walletLogger = createProxyLogger("wallet:data:lmdb", logPort);
      const walletDBStore = await createStore(
        `wallet-${rollupAddress}`,
        2,
        {
          dataDirectory: resolve(keychainHomeDir, `wallet-${rollupAddress}`),
          dataStoreMapSizeKB: 2e10,
        },
        walletLogger
      );
      const db = WalletDB.init(walletDBStore, walletLogger.info);
      const pxe = await createPXE(
        node,
        { ...getPXEConfig(), ...configOverrides },
        options
      );

      const pendingAuthorizations = new Map<
        string,
        {
          promise: PromiseWithResolvers<AuthorizationResponse>;
          request: AuthorizationRequest;
        }
      >();

      // Create both wallet instances sharing the same db, pxe and authorization logic
      const externalWallet = new ExternalWallet(
        pxe,
        node,
        db,
        pendingAuthorizations,
        appId,
        chainInfo
      );
      const internalWallet = new InternalWallet(
        pxe,
        node,
        db,
        pendingAuthorizations,
        appId,
        chainInfo
      );

      // Wire up events from both wallets to internal port
      const setupWalletEvents = (wallet: ExternalWallet | InternalWallet) => {
        wallet.addEventListener("wallet-update", (event: CustomEvent) => {
          internalPort.postMessage({
            origin: "wallet",
            type: "wallet-update",
            content: event.detail,
          });
        });

        wallet.addEventListener(
          "authorization-request",
          (event: CustomEvent) => {
            internalPort.postMessage({
              origin: "wallet",
              type: "authorization-request",
              content: event.detail,
            });
          }
        );
      };

      setupWalletEvents(externalWallet);
      setupWalletEvents(internalWallet);

      return { external: externalWallet, internal: internalWallet };
    };
    const appMap = RUNNING_SESSIONS.get(appId) ?? new Map();
    RUNNING_SESSIONS.set(appId, appMap);
    const walletPromise = internalInit();
    appMap.set(sessionId, walletPromise);
  }
  const wallets = await RUNNING_SESSIONS.get(appId)!.get(sessionId)!;
  return wallets;
}

const handleEvent = async (
  port: MessagePortMain,
  wallet: ExternalWallet | InternalWallet,
  schema: typeof WalletSchema | typeof InternalWalletInterfaceSchema,
  type: string,
  messageId: string,
  args: any[],
  userLog: Logger
) => {
  if (!schemaHasMethod(schema, type)) {
    throw new Error(`Unknown method: ${type}`);
  }
  const sanitizedArgs = await parseWithOptionals(
    args,
    schema[type].parameters()
  );
  let result;
  let error;
  try {
    result = await wallet[type](...sanitizedArgs);
  } catch (err: any) {
    userLog.error(`Error handling ${type}: ${err.message}`);
    error = err;
  }
  port.postMessage({
    origin: "wallet",
    content: jsonStringify({ messageId, result, error }),
  });
};

async function main() {
  let userLog;
  process.on("unhandledRejection", (error: Error) => {
    if (userLog) {
      userLog.error(
        `Unhandled rejection ${typeof error.message == "object" ? inspect(error.message) : error.message}`
      );
    }
  });
  process.parentPort.once("message", async (message: any) => {
    if (message.data.type === "ports" && message.ports?.length) {
      const [externalPort, internalPort, logPort] = message.ports;
      userLog = createProxyLogger("wallet:worker", logPort);
      externalPort.on("message", async (event) => {
        const { origin, content } = event.data;
        if (origin !== "websocket") {
          return;
        }
        const { type, messageId, args, appId, chainInfo } = JSON.parse(content);
        if (appId === "this") {
          throw new Error("External messages cannot have this as appId");
        }
        userLog.debug("Received external message:", event.data);
        const parsedChainInfo = ChainInfoSchema.parse(chainInfo);
        const wallets = await init(
          parsedChainInfo as unknown as ChainInfo,
          appId,
          internalPort,
          logPort
        );
        // Use external wallet for external requests
        handleEvent(
          externalPort,
          wallets.external,
          WalletSchema,
          type,
          messageId,
          args,
          userLog
        );
      });
      internalPort.on("message", async (event) => {
        const {
          type,
          messageId,
          args,
          appId: originalAppId,
          chainInfo,
        } = event.data;
        if (!messageId) {
          return;
        }
        const parsedChainInfo = ChainInfoSchema.parse(chainInfo);
        userLog.debug("Received internal message:", {
          type,
          messageId,
          args,
          chainInfo: parsedChainInfo,
          originalAppId,
        });

        // If this is an authorization response, it originated from an app, but
        // was handled interally. Recover the original app from the args.
        const appId =
          // This is sligthly ugly since we're takinga advantage of the fact that
          // we know the shape of the args for this specific method.
          type === "resolveAuthorization" && args[0].appId !== "this"
            ? args[0].appId
            : originalAppId;

        const wallets = await init(
          parsedChainInfo as unknown as ChainInfo,
          appId,
          internalPort,
          logPort
        );
        // Use internal wallet for internal requests, except when handling
        // resolveAuthorization (which was always originated by the external one)
        const wallet =
          type === "resolveAuthorization" && appId !== "this"
            ? wallets.external
            : wallets.internal;
        handleEvent(
          internalPort,
          wallet,
          InternalWalletInterfaceSchema,
          type,
          messageId,
          args,
          userLog
        );
      });
      externalPort.start();
      internalPort.start();
      logPort.start();
    }
  });
}

main();
