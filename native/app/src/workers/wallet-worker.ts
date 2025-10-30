import { createAztecNodeClient } from "@aztec/aztec.js/node";
import { type ChainInfo } from "@aztec/aztec.js/account";
import { WalletSchema } from "@aztec/aztec.js/wallet";
import { Fr } from "@aztec/aztec.js/fields";
import { parseWithOptionals, schemaHasMethod } from "@aztec/foundation/schemas";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import type { MessagePortMain } from "electron";
import { ExternalWallet } from "../wallet/core/external-wallet.ts";
import { InternalWalletInterfaceSchema } from "../ipc/wallet-internal-proxy.ts";
import { createPXE, getPXEConfig } from "@aztec/pxe/server";
import { schemas } from "@aztec/stdlib/schemas";

import { createStore } from "@aztec/kv-store/lmdb-v2";
import { resolve, join } from "node:path";
import { createProxyLogger } from "../wallet/utils/logger.ts";
import { WalletDB } from "../wallet/database/wallet-db.ts";
import { z } from "zod";
import { homedir } from "node:os";
import { inspect } from "node:util";
import type { PromiseWithResolvers } from "@aztec/foundation/promise";
import type {
  AuthorizationRequest,
  AuthorizationResponse,
} from "../wallet/types/authorization.ts";
import type { Logger } from "pino";
import { InternalWallet } from "../wallet/core/internal-wallet.ts";
import { getNetworkByChainId } from "../config/networks.ts";

console.log(process.env);

const ChainInfoSchema = z.object({
  chainId: schemas.Fr,
  version: schemas.Fr,
});

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
  const network = getNetworkByChainId(
    chainInfo.chainId.toNumber(),
    chainInfo.version.toNumber()
  );
  if (!network) {
    throw new Error(
      `Unknown network: chainId=${chainInfo.chainId.toNumber()}, version=${chainInfo.version.toNumber()}`
    );
  }
  const node = createAztecNodeClient(network.nodeUrl!);
  if (chainInfo.version.equals(new Fr(0))) {
    const { rollupVersion } = await node.getNodeInfo();
    chainInfo.version = new Fr(rollupVersion);
  }
  const sessionId = `${chainInfo.chainId.toNumber()}-${chainInfo.version.toNumber()}`;
  if (!RUNNING_SESSIONS.get(appId)?.has(sessionId)) {
    const internalInit = async () => {
      const l1Contracts = await node.getL1ContractAddresses();

      const rollupAddress = l1Contracts.rollupAddress;

      const keychainHomeDir = join(homedir(), "keychain");

      const configOverrides = {
        dataDirectory: resolve(keychainHomeDir, `./pxe-${rollupAddress}`),
        proverEnabled: true,
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
            dataStoreMapSizeKb: 2e10,
          },
          createProxyLogger("pxe:data:lmdb", logPort)
        ),
      };

      const walletDBLogger = createProxyLogger("wallet:data:lmdb", logPort);
      const walletDBStore = await createStore(
        `wallet-${rollupAddress}`,
        2,
        {
          dataDirectory: resolve(keychainHomeDir, `wallet-${rollupAddress}`),
          dataStoreMapSizeKb: 2e10,
        },
        walletDBLogger
      );
      const db = WalletDB.init(walletDBStore, walletDBLogger);
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

      const externalWalletLogger = createProxyLogger(
        "wallet:external",
        logPort
      );
      const internalWalletLogger = createProxyLogger(
        "wallet:external",
        logPort
      );

      // Create both wallet instances sharing the same db, pxe and authorization logic
      const externalWallet = new ExternalWallet(
        pxe,
        node,
        db,
        pendingAuthorizations,
        appId,
        chainInfo,
        externalWalletLogger
      );
      const internalWallet = new InternalWallet(
        pxe,
        node,
        db,
        pendingAuthorizations,
        appId,
        chainInfo,
        internalWalletLogger
      );

      // Wire up events from both wallets to internal port
      const setupWalletEvents = (wallet: ExternalWallet | InternalWallet) => {
        wallet.addEventListener("wallet-update", (event: CustomEvent) => {
          internalPort.postMessage({
            origin: "wallet",
            type: "wallet-update",
            content: event.detail,
            chainInfo: {
              chainId: chainInfo.chainId.toString(),
              version: chainInfo.version.toString(),
            },
          });
        });

        wallet.addEventListener(
          "authorization-request",
          (event: CustomEvent) => {
            internalPort.postMessage({
              origin: "wallet",
              type: "authorization-request",
              content: event.detail,
              chainInfo: {
                chainId: chainInfo.chainId.toString(),
                version: chainInfo.version.toString(),
              },
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
    // Serialize error properly - Error objects don't stringify well
    error = err instanceof Error ? err.message : String(err);
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
          // This is sligthly ugly since we're taking advantage of the fact that
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
