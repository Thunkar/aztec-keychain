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

  process.parentPort.on("message", async (event) => {
    console.log("Received message:", event.data);

    const { type, messageId, args } = JSON.parse(event.data);

    console.log("Parsed message:", { type, messageId, args });

    if (!schemaHasMethod(schema, type)) {
      throw new Error(`Unknown method: ${type}`);
    }

    const sanitizedArgs = await parseWithOptionals(
      args,
      schema[type].parameters()
    );
    const result = await (wallet as unknown as Wallet)[type](...sanitizedArgs);
    process.parentPort.postMessage(jsonStringify({ messageId, result }));
  });
}

main();
