import {
  createAztecNodeClient,
  WalletSchema,
  type ChainInfo,
} from "@aztec/aztec.js";
import { parseWithOptionals, schemaHasMethod } from "@aztec/foundation/schemas";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import type { MessagePortMain } from "electron";
import {
  ExternalWallet,
  InternalWallet,
} from "./wallet-utils/native-wallet.ts";
import { InternalWalletInterfaceSchema } from "./wallet-internal-proxy.ts";
import { createPXE, getPXEConfig, type PXE } from "@aztec/pxe/server";
import { schemas } from "@aztec/stdlib/schemas";

import { createStore } from "@aztec/kv-store/lmdb-v2";
import { resolve, join } from "node:path";
import { createProxyLogger } from "./wallet-utils/logger";
import { WalletDB } from "./wallet-utils/wallet_db.ts";
import { z } from "zod";
import { homedir } from "node:os";
import { inspect } from "node:util";

const ChainInfoSchema = z.object({
  chainId: schemas.Fr,
  version: schemas.Fr,
});

const chainInfoToNodeURL = {
  31337: "http://localhost:8080",
  1115111: {
    1714840162: "https://rpc.testnet.aztec-labs.com/",
  },
};

const RUNNING_SESSIONS = new Map<
  string,
  Map<string, { external: ExternalWallet; internal: InternalWallet }>
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

      // Create both wallet instances sharing the same db and pxe
      const externalWallet = new ExternalWallet(pxe, node, db, appId);
      const internalWallet = new InternalWallet(pxe, node, db, appId);

      // Wire up events from both wallets to internal port
      const setupWalletEvents = (wallet: ExternalWallet | InternalWallet) => {
        wallet.addEventListener("wallet-update", (event: CustomEvent) => {
          internalPort.postMessage({ origin: "wallet", content: event.detail });
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
    appMap.set(sessionId, internalInit());
  }
  return RUNNING_SESSIONS.get(appId)!.get(sessionId)!;
}

const handleEvent = async (
  port: MessagePortMain,
  wallet: ExternalWallet | InternalWallet,
  schema: typeof WalletSchema | typeof InternalWalletInterfaceSchema,
  type: string,
  messageId: string,
  args: any[]
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
  } catch (err) {
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
          args
        );
      });
      internalPort.on("message", async (event) => {
        const { type, messageId, args, appId, chainInfo, authResponse } =
          event.data;

        // Handle authorization responses. This is slightly convoluted, since it's an internal
        // communication that is resolved by the external wallet (which is the one that emitted
        // the request in the first place)
        if (type === "authorization-response" && authResponse) {
          const parsedChainInfo = ChainInfoSchema.parse(JSON.parse(chainInfo));
          const wallets = await init(
            parsedChainInfo as unknown as ChainInfo,
            appId,
            internalPort,
            logPort
          );
          // Resolve authorization on external wallet
          wallets.external.resolveAuthorization(authResponse);
          return;
        }

        if (!messageId) {
          return;
        }
        const parsedChainInfo = ChainInfoSchema.parse(JSON.parse(chainInfo));
        userLog.debug("Received internal message:", {
          type,
          messageId,
          args,
          chainInfo: parsedChainInfo,
          appId,
        });

        const wallets = await init(
          parsedChainInfo as unknown as ChainInfo,
          appId,
          internalPort,
          logPort
        );
        // Use internal wallet for internal requests
        handleEvent(
          internalPort,
          wallets.internal,
          InternalWalletInterfaceSchema,
          type,
          messageId,
          args
        );
      });
      externalPort.start();
      internalPort.start();
      logPort.start();
    }
  });
}

main();
