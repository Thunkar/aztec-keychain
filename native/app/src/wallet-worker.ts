import {
  createAztecNodeClient,
  type AztecNode,
  type ChainInfo,
  type Wallet,
} from "@aztec/aztec.js";
import { parseWithOptionals, schemaHasMethod } from "@aztec/foundation/schemas";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import type { MessagePortMain } from "electron";
import { NativeWallet } from "./wallet-utils/native-wallet.ts";
import { NativeWalletInterfaceSchema } from "./wallet-utils/wallet-internal-proxy.ts";
import { createPXE, getPXEConfig, type PXE } from "@aztec/pxe/server";
import { schemas } from "@aztec/stdlib/schemas";

import { createStore } from "@aztec/kv-store/lmdb-v2";
import { resolve } from "node:path";
import { createProxyLogger } from "./wallet-utils/logger";
import { WalletDB } from "./wallet-utils/wallet_db.ts";
import { z } from "zod";
import { homedir } from "node:os";

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

type NetworkDependantData = { db: WalletDB; node: AztecNode; pxe: PXE };

const RUNNING_SESSIONS = new Map<string, Promise<NetworkDependantData>>();

async function init(
  chainInfo: ChainInfo,
  appId: string,
  logPort: MessagePortMain,
  userInteractionPort: MessagePortMain
) {
  const nodeURL =
    typeof chainInfoToNodeURL[chainInfo.chainId.toNumber()] === "string"
      ? chainInfoToNodeURL[chainInfo.chainId.toNumber()]
      : chainInfoToNodeURL[chainInfo.chainId.toNumber()][
          chainInfo.version.toNumber()
        ];
  const sessionId = `${chainInfo.chainId.toNumber()}-${chainInfo.version.toNumber()}`;
  if (!RUNNING_SESSIONS.has(sessionId)) {
    const internalInit = async () => {
      const node = createAztecNodeClient(nodeURL);

      const l1Contracts = await node.getL1ContractAddresses();

      const rollupAddress = l1Contracts.rollupAddress;

      const configOverrides = {
        dataDirectory: resolve(homedir(), "keychain", `./pxe-${rollupAddress}`),
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
          configOverrides,
          createProxyLogger("pxe:data:lmdb", logPort)
        ),
      };

      const walletLogger = createProxyLogger("wallet:data:lmdb", logPort);
      const walletDBStore = await createStore(
        `wallet-${rollupAddress}`,
        2,
        {
          dataDirectory: resolve(
            homedir(),
            "keychain",
            `wallet-${rollupAddress}`
          ),
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
      return { node, db, pxe };
    };
    RUNNING_SESSIONS.set(sessionId, internalInit());
  }
  const { node, db, pxe } = await RUNNING_SESSIONS.get(sessionId);

  return new NativeWallet(pxe, node, db, appId);
}

const handleEvent = async (
  port: MessagePortMain,
  wallet: Wallet,
  type: string,
  messageId: string,
  args: any[]
) => {
  if (!schemaHasMethod(NativeWalletInterfaceSchema, type)) {
    throw new Error(`Unknown method: ${type}`);
  }
  const sanitizedArgs = await parseWithOptionals(
    args,
    NativeWalletInterfaceSchema[type].parameters()
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
      userLog.error(`Unhandled rejection ${error.message}`);
    }
  });
  process.parentPort.once("message", async (message: any) => {
    if (message.data.type === "ports" && message.ports?.length) {
      const [externalPort, internalPort, logPort, userInteractionPort] =
        message.ports;
      userLog = createProxyLogger("wallet:worker", logPort);
      externalPort.on("message", async (event) => {
        const { origin, content } = event.data;
        if (origin !== "websocket") {
          return;
        }
        const { type, messageId, args, appId, chainInfo } = JSON.parse(content);
        userLog.debug("Received external message:", event.data);
        const parsedChainInfo = ChainInfoSchema.parse(chainInfo);
        const wallet = await init(
          parsedChainInfo as unknown as ChainInfo,
          appId,
          logPort,
          userInteractionPort
        );
        handleEvent(externalPort, wallet, type, messageId, args);
      });
      internalPort.on("message", async (event) => {
        const { type, messageId, args, appId, chainInfo } = event.data;
        const parsedChainInfo = ChainInfoSchema.parse(JSON.parse(chainInfo));
        userLog.debug("Received internal message:", {
          type,
          messageId,
          args,
          chainInfo: parsedChainInfo,
          appId,
        });

        const wallet = await init(
          parsedChainInfo as unknown as ChainInfo,
          appId,
          logPort,
          userInteractionPort
        );
        handleEvent(internalPort, wallet, type, messageId, args);
      });
      externalPort.start();
      internalPort.start();
      logPort.start();
    }
  });
}

main();
