import { getPXEServiceConfig } from "@aztec/pxe/config";
import { createPXEService } from "@aztec/pxe/server";
import {
  createAztecNodeClient,
  generateWalletSchema,
  type Wallet,
} from "@aztec/aztec.js";
import { TestWallet } from "@aztec/test-wallet";
import { parseWithOptionals, schemaHasMethod } from "@aztec/foundation/schemas";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import type { MessagePortMain } from "electron";

async function main() {
  console.log("Starting wallet utility process...");
  const nodeURL = "http://localhost:8080";
  const aztecNode = await createAztecNodeClient(nodeURL);
  console.log("Connected to Aztec node at", nodeURL);

  const l1Contracts = await aztecNode.getL1ContractAddresses();

  console.log("L1 Contracts:", l1Contracts);
  const rollupAddress = l1Contracts.rollupAddress;

  const config = getPXEServiceConfig();
  config.dataDirectory = `pxe-${rollupAddress}`;
  config.proverEnabled = true;
  const configWithContracts = {
    ...config,
    l1Contracts,
  };

  const pxe = await createPXEService(aztecNode, configWithContracts);
  console.log("PXE Service started with config:", configWithContracts);

  const wallet = new TestWallet(pxe);
  const schema = generateWalletSchema(wallet);

  const handleExternalEvent = (port: MessagePortMain) => async (event: any) => {
    const { origin, content } = event.data;
    if (origin !== "websocket") {
      return;
    }
    await handleEvent(port)(content);
  };

  const handleEvent = (port: MessagePortMain) => async (content: any) => {
    const { type, messageId, args } = JSON.parse(content);

    console.log("Parsed message:", { type, messageId, args });

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

  process.parentPort.once("message", (message: any) => {
    if (message.data.type === "ports" && message.ports?.length) {
      const [externalPort, internalPort] = message.ports;
      externalPort.on("message", async (event) => {
        console.log("Received external message:", event.data);
        handleExternalEvent(externalPort)(event);
      });
      internalPort.on("message", async (event) => {
        console.log("Received internal message:", event.data);
        handleEvent(internalPort)(event.data);
      });
      externalPort.start();
      internalPort.start();
    }
  });
}

main();
