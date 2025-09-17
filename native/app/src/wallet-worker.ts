import { getPXEServiceConfig } from "@aztec/pxe/config";
import { createPXEService } from "@aztec/pxe/server";
import {
  createAztecNodeClient,
  generateWalletSchema,
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

async function init(logPort: MessagePortMain) {
  const nodeURL = "http://localhost:8080";
  const aztecNode = await createAztecNodeClient(nodeURL);

  const l1Contracts = await aztecNode.getL1ContractAddresses();

  const rollupAddress = l1Contracts.rollupAddress;

  const config = getPXEServiceConfig();
  config.dataDirectory = resolve(__dirname, `./pxe-${rollupAddress}`);
  config.proverEnabled = true;
  const configWithContracts = {
    ...config,
    l1Contracts,
  };

  const pxe = await createPXEService(aztecNode, configWithContracts, {
    loggers: {
      store: createProxyLogger("pxe:data:lmdb", logPort),
      pxe: createProxyLogger("pxe:service", logPort),
      prover: createProxyLogger("bb:native", logPort),
    },
    store: await createStore(
      "pxe_data",
      2,
      configWithContracts,
      createProxyLogger("pxe:data:lmdb", logPort)
    ),
  });

  return new NativeWallet(pxe);
}

const handleExternalEvent = (port: MessagePortMain, wallet: Wallet) => {
  const schema = generateWalletSchema(wallet);
  return async (event: any) => {
    const { origin, content } = event.data;
    if (origin !== "websocket") {
      return;
    }
    const { type, messageId, args } = JSON.parse(content);

    if (!schemaHasMethod(schema, type)) {
      throw new Error(`Unknown method: ${type}`);
    }

    const sanitizedArgs = await parseWithOptionals(
      args,
      schema[type].parameters()
    );
    const result = await (wallet as unknown as Wallet)[type](...sanitizedArgs);
    port.postMessage({
      origin: "wallet",
      content: jsonStringify({ messageId, result }),
    });
  };
};

const handleInternalEvent =
  (port: MessagePortMain, wallet: NativeWallet) => async (content: any) => {
    const { type, messageId, args } = JSON.parse(content);

    if (!schemaHasMethod(NativeWalletInterfaceSchema, type)) {
      throw new Error(`Unknown method: ${type}`);
    }

    const sanitizedArgs = await parseWithOptionals(
      args,
      NativeWalletInterfaceSchema[type].parameters()
    );
    const result = await (wallet as unknown as NativeWallet)[type](
      ...sanitizedArgs
    );
    port.postMessage({
      origin: "wallet",
      content: jsonStringify({ messageId, result }),
    });
  };

async function main() {
  process.parentPort.once("message", async (message: any) => {
    if (message.data.type === "ports" && message.ports?.length) {
      const [externalPort, internalPort, logPort] = message.ports;
      const userLog = createProxyLogger("wallet:worker", logPort);
      const wallet = await init(logPort);
      externalPort.on("message", async (event) => {
        userLog.debug("Received external message:", event.data);
        handleExternalEvent(externalPort, wallet)(event);
      });
      internalPort.on("message", async (event) => {
        userLog.debug("Received internal message:", event.data);
        handleInternalEvent(internalPort, wallet)(event.data);
      });
      externalPort.start();
      internalPort.start();
      logPort.start();
    }
  });
}

main();
