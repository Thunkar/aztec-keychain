import {
  createAztecNodeClient,
  type Wallet,
  type Logger,
  createLogger,
} from "@aztec/aztec.js";
import { parseWithOptionals, schemaHasMethod } from "@aztec/foundation/schemas";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import type { MessagePortMain } from "electron";
import { NativeWallet } from "./wallet-utils/native-wallet.ts";
import { NativeWalletInterfaceSchema } from "./wallet-utils/wallet-proxy.ts";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "@aztec/kv-store/lmdb-v2";
import { WalletDB } from "./wallet-utils/wallet_db.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

const logLevel = [
  "silent",
  "fatal",
  "error",
  "warn",
  "info",
  "verbose",
  "debug",
  "trace",
] as const;
type LogLevel = (typeof logLevel)[number];

function createProxyLogger(prefix: string, logPort: MessagePortMain): Logger {
  return new Proxy(createLogger(prefix), {
    get: (target, prop) => {
      if (logLevel.includes(prop as (typeof logLevel)[number])) {
        return function (this: Logger, ...data: Parameters<Logger[LogLevel]>) {
          const loggingFn = prop as LogLevel;
          const args = [loggingFn, prefix, ...data];
          logPort.postMessage({ type: "log", args: jsonStringify(args) });
          target[loggingFn].call(this, ...[data[0], data[1]]);
        };
      } else {
        return target[prop];
      }
    },
  });
}

async function init(
  logPort: MessagePortMain,
  userInteractionPort: MessagePortMain
) {
  const nodeURL = "http://localhost:8080";
  const aztecNode = await createAztecNodeClient(nodeURL);

  const l1Contracts = await aztecNode.getL1ContractAddresses();

  const rollupAddress = l1Contracts.rollupAddress;

  const configOverrides = {
    dataDirectory: resolve(__dirname, `./pxe-${rollupAddress}`),
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
    { dataDirectory: "wallet", dataStoreMapSizeKB: 2e10 },
    walletLogger
  );
  const db = WalletDB.init(walletDBStore, walletLogger.info);

  return NativeWallet.create(aztecNode, db, configOverrides, options);
}

const handleEvent = async (
  port: MessagePortMain,
  wallet: Wallet,
  content: any
) => {
  const { type, messageId, args } = JSON.parse(content);

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

const handleExternalEvent = (
  port: MessagePortMain,
  wallet: Wallet,
  event: any
) => {
  const { origin, content } = event.data;
  if (origin !== "websocket") {
    return;
  }
  handleEvent(port, wallet, content);
};

async function main() {
  let userLog;
  process.on("unhandledRejection", (error) => {
    if (userLog) {
      userLog.error("Unhandled rejection", jsonStringify(error));
    }
  });
  process.parentPort.once("message", async (message: any) => {
    if (message.data.type === "ports" && message.ports?.length) {
      const [externalPort, internalPort, logPort, userInteractionPort] =
        message.ports;
      userLog = createProxyLogger("wallet:worker", logPort);
      const wallet = await init(logPort, userInteractionPort);
      externalPort.on("message", async (event) => {
        userLog.debug("Received external message:", event);
        handleExternalEvent(externalPort, wallet, event);
      });
      internalPort.on("message", async (event) => {
        userLog.debug("Received internal message:", event);
        handleEvent(internalPort, wallet, event.data);
      });
      externalPort.start();
      internalPort.start();
      logPort.start();
    }
  });
}

main();
