import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr, Fq } from "@aztec/aztec.js/fields";
import { type Aliased } from "@aztec/aztec.js/wallet";
import { type LogFn, type Logger } from "@aztec/foundation/log";
import { type AztecAsyncMap, type AztecAsyncKVStore } from "@aztec/kv-store";
import {
  WalletInteraction,
  type WalletInteractionType,
} from "../types/wallet-interaction";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import { TxExecutionRequest, TxSimulationResult } from "@aztec/stdlib/tx";
import { json } from "express";

export const AccountTypes = [
  "schnorr",
  "ecdsasecp256r1",
  "ecdsasecp256k1",
] as const;
export type AccountType = (typeof AccountTypes)[number];

export class WalletDB {
  private constructor(
    private accounts: AztecAsyncMap<string, Buffer>,
    private aliases: AztecAsyncMap<string, Buffer>,
    private bridgedFeeJuice: AztecAsyncMap<string, Buffer>,
    private interactions: AztecAsyncMap<string, Buffer>,
    private authorizations: AztecAsyncMap<string, Buffer>,
    private txSimulations: AztecAsyncMap<string, string>,
    private logger: Logger
  ) {}

  static init(store: AztecAsyncKVStore, logger: Logger) {
    const accounts = store.openMap<string, Buffer>("accounts");
    const aliases = store.openMap<string, Buffer>("aliases");
    const bridgedFeeJuice = store.openMap<string, Buffer>("bridgedFeeJuice");
    const interactions = store.openMap<string, Buffer>("interactions");
    const authorizations = store.openMap<string, Buffer>("authorizations");
    const txSimulations = store.openMap<string, string>("txSimulations");
    return new WalletDB(
      accounts,
      aliases,
      bridgedFeeJuice,
      interactions,
      authorizations,
      txSimulations,
      logger
    );
  }

  async pushBridgedFeeJuice(
    recipient: AztecAddress,
    secret: Fr,
    amount: bigint,
    leafIndex: bigint
  ) {
    let stackPointer =
      (
        await this.bridgedFeeJuice.getAsync(
          `${recipient.toString()}:stackPointer`
        )
      )?.readInt8() || 0;
    stackPointer++;
    await this.bridgedFeeJuice.set(
      `${recipient.toString()}:${stackPointer}`,
      Buffer.from(
        `${amount.toString()}:${secret.toString()}:${leafIndex.toString()}`
      )
    );
    await this.bridgedFeeJuice.set(
      `${recipient.toString()}:stackPointer`,
      Buffer.from([stackPointer])
    );
    this.logger.info(
      `Pushed ${amount} fee juice for recipient ${recipient.toString()}. Stack pointer ${stackPointer}`
    );
  }

  async popBridgedFeeJuice(recipient: AztecAddress) {
    let stackPointer =
      (
        await this.bridgedFeeJuice.getAsync(
          `${recipient.toString()}:stackPointer`
        )
      )?.readInt8() || 0;
    const result = await this.bridgedFeeJuice.getAsync(
      `${recipient.toString()}:${stackPointer}`
    );
    if (!result) {
      throw new Error(
        `No stored fee juice available for recipient ${recipient.toString()}. Please provide claim amount and secret. Stack pointer ${stackPointer}`
      );
    }
    const [amountStr, secretStr, leafIndexStr] = result.toString().split(":");
    await this.bridgedFeeJuice.set(
      `${recipient.toString()}:stackPointer`,
      Buffer.from([--stackPointer])
    );
    this.logger.info(
      `Retrieved ${amountStr} fee juice for recipient ${recipient.toString()}. Stack pointer ${stackPointer}`
    );
    return {
      amount: BigInt(amountStr),
      secret: secretStr,
      leafIndex: BigInt(leafIndexStr),
    };
  }

  async storeAccount(
    address: AztecAddress,
    {
      type,
      secretKey,
      salt,
      alias,
      signingKey,
    }: {
      type: AccountType;
      secretKey: Fr;
      salt: Fr;
      signingKey: Fq | Buffer;
      alias: string | undefined;
    }
  ) {
    if (alias) {
      await this.aliases.set(
        `accounts:${alias}`,
        Buffer.from(address.toString())
      );
    }
    await this.accounts.set(`${address.toString()}:type`, Buffer.from(type));
    await this.accounts.set(`${address.toString()}:sk`, secretKey.toBuffer());
    await this.accounts.set(`${address.toString()}:salt`, salt.toBuffer());
    await this.accounts.set(
      `${address.toString()}:signingKey`,
      "toBuffer" in signingKey ? signingKey.toBuffer() : signingKey
    );
    this.logger.info(
      `Account stored in database with alias${alias ? `es last & ${alias}` : " last"}`
    );
  }

  async storeSender(address: AztecAddress, alias: string) {
    await this.aliases.set(`senders:${alias}`, Buffer.from(address.toString()));
    this.logger.info(`Sender stored in database with alias ${alias}`);
  }

  async storeAccountMetadata(
    aliasOrAddress: AztecAddress | string,
    metadataKey: string,
    metadata: Buffer
  ) {
    const { address } = await this.retrieveAccount(aliasOrAddress);
    await this.accounts.set(`${address.toString()}:${metadataKey}`, metadata);
  }

  async retrieveAccountMetadata(
    aliasOrAddress: AztecAddress | string,
    metadataKey: string
  ) {
    const { address } = await this.retrieveAccount(aliasOrAddress);
    const result = await this.accounts.getAsync(
      `${address.toString()}:${metadataKey}`
    );
    if (!result) {
      throw new Error(
        `Could not find metadata with key ${metadataKey} for account ${aliasOrAddress}`
      );
    }
    return result;
  }

  async retrieveAccount(address: AztecAddress | string) {
    const secretKeyBuffer = await this.accounts.getAsync(
      `${address.toString()}:sk`
    );
    if (!secretKeyBuffer) {
      throw new Error(
        `Could not find ${address}:sk. Account "${address.toString}" does not exist on this wallet.`
      );
    }
    const secretKey = Fr.fromBuffer(secretKeyBuffer);
    const salt = Fr.fromBuffer(
      await this.accounts.getAsync(`${address.toString()}:salt`)!
    );
    const type = (
      await this.accounts.getAsync(`${address.toString()}:type`)!
    ).toString("utf8") as AccountType;
    const signingKey = await this.accounts.getAsync(
      `${address.toString()}:signingKey`
    )!;
    return { address, secretKey, salt, type, signingKey };
  }

  async listAccounts(): Promise<Aliased<AztecAddress>[]> {
    const result = [];
    for await (const [alias, item] of this.aliases.entriesAsync()) {
      if (alias.startsWith("accounts:")) {
        result.push({
          alias: alias.replace("accounts:", ""),
          item: AztecAddress.fromString(item.toString()),
        });
      }
    }
    return result;
  }

  async listSenders(): Promise<Aliased<AztecAddress>[]> {
    const result = [];
    for await (const [alias, item] of this.aliases.entriesAsync()) {
      if (alias.startsWith("senders:")) {
        result.push({ alias, item: AztecAddress.fromString(item.toString()) });
      }
    }
    return result;
  }

  async deleteAccount(address: AztecAddress) {
    await this.accounts.delete(`${address.toString()}:sk`);
    await this.accounts.delete(`${address.toString()}:salt`);
    await this.accounts.delete(`${address.toString()}:type`);
    await this.accounts.delete(`${address.toString()}:signingKey`);
    const accounts = await this.listAccounts();
    const account = accounts.find((account) => address.equals(account.item));
    await this.aliases.delete(account?.alias);
  }

  async storeInteraction<T extends WalletInteractionType>(
    interaction: WalletInteraction<T>
  ) {
    await this.interactions.set(interaction.id, interaction.toBuffer());
  }

  async createOrUpdateInteraction(
    interaction: WalletInteraction<WalletInteractionType>
  ) {
    const { id, status, complete } = interaction;
    const maybeInteractionBuffer = await this.interactions.getAsync(id);
    if (!maybeInteractionBuffer) {
      await this.storeInteraction(interaction);
    } else {
      const storedInteraction = WalletInteraction.fromBuffer(
        maybeInteractionBuffer
      );
      storedInteraction.status = status;
      storedInteraction.complete = complete;
      await this.storeInteraction(storedInteraction);
    }
  }

  async listInteractions() {
    const result = [];
    for await (const [_, item] of this.interactions.entriesAsync()) {
      result.push(WalletInteraction.fromBuffer(item));
    }
    // Sort by timestamp descending (newest first)
    return result.sort((a, b) => b.timestamp - a.timestamp);
  }

  async storePersistentAuthorization(appId: string, key: string, data: any) {
    const fullKey = `${appId}:${key}`;
    await this.authorizations.set(fullKey, Buffer.from(jsonStringify(data)));
    this.logger.info(`Persistent authorization stored for ${fullKey}`);
  }

  async retrievePersistentAuthorization(
    appId: string,
    key: string
  ): Promise<any | undefined> {
    const fullKey = `${appId}:${key}`;
    const result = await this.authorizations.getAsync(fullKey);
    if (!result) {
      return undefined;
    }
    return JSON.parse(result.toString());
  }

  async storeBatchPersistentAuthorizations(
    appId: string,
    itemResponses: Record<string, any>,
    itemMethods: Map<string, string>,
    itemKeyModifiers?: Map<string, string>
  ) {
    for (const [itemId, response] of Object.entries(itemResponses)) {
      if (response.approved && response.data?.persistent) {
        const authorizationType = itemMethods.get(itemId);
        if (authorizationType) {
          const keyModifier = itemKeyModifiers?.get(itemId);
          const key = keyModifier
            ? `${authorizationType}:${keyModifier}`
            : authorizationType;
          await this.storePersistentAuthorization(appId, key, response.data);
        }
      }
    }
  }

  /**
   * List all apps that have persistent authorizations
   */
  async listAuthorizedApps(): Promise<string[]> {
    const appIds = new Set<string>();
    for await (const [key, _] of this.authorizations.entriesAsync()) {
      // Keys are formatted as "${appId}:${method}"
      const appId = key.split(":")[0];
      if (appId) {
        appIds.add(appId);
      }
    }
    return Array.from(appIds);
  }

  /**
   * Get all persistent authorizations for a specific app
   * Returns detailed authorization information including parsed simulation data
   */
  async getAppAuthorizations(appId: string): Promise<{
    accounts: { alias: string; item: string }[];
    contacts: { alias: string; item: string }[];
    simulations: Array<{
      type: "simulateTx" | "simulateUtility";
      payloadHash: string;
      title?: string;
      key: string;
    }>;
    otherMethods: string[];
  }> {
    const accounts: { alias: string; item: string }[] = [];
    const contacts: { alias: string; item: string }[] = [];
    const simulations: Array<{
      type: "simulateTx" | "simulateUtility";
      payloadHash: string;
      title?: string;
      key: string;
    }> = [];
    const otherMethods: string[] = [];

    for await (const [key, value] of this.authorizations.entriesAsync()) {
      const parts = key.split(":");
      const authAppId = parts[0];

      if (authAppId !== appId) {
        continue;
      }

      const method = parts[1];
      if (!method) {
        continue;
      }

      // Parse the authorization type
      if (method === "getAccounts") {
        const data = JSON.parse(value.toString());
        accounts.push(...(data.accounts || []));
      } else if (method === "getAddressBook") {
        const data = JSON.parse(value.toString());
        contacts.push(...(data.contacts || []));
      } else if (method === "simulateTx" && parts.length === 3) {
        const payloadHash = parts[2];
        const data = JSON.parse(value.toString());
        simulations.push({
          type: "simulateTx",
          payloadHash,
          title: data.title,
          key,
        });
      } else if (method === "simulateUtility" && parts.length === 3) {
        const payloadHash = parts[2];
        const data = JSON.parse(value.toString());
        simulations.push({
          type: "simulateUtility",
          payloadHash,
          title: data.title,
          key,
        });
      } else {
        otherMethods.push(method);
      }
    }

    return { accounts, contacts, simulations, otherMethods };
  }

  /**
   * Update the getAccounts authorization for an app
   */
  async updateAccountAuthorization(
    appId: string,
    accounts: Aliased<AztecAddress>[]
  ) {
    await this.storePersistentAuthorization(appId, "getAccounts", { accounts });
  }

  /**
   * Update the getAddressBook authorization for an app
   */
  async updateAddressBookAuthorization(
    appId: string,
    contacts: Aliased<AztecAddress>[]
  ) {
    await this.storePersistentAuthorization(appId, "getAddressBook", { contacts });
  }

  /**
   * Revoke a specific authorization by its full key
   */
  async revokeAuthorization(key: string) {
    this.logger.info(`Attempting to revoke authorization with key: ${key}`);
    const existsBefore = await this.authorizations.getAsync(key);
    this.logger.info(
      `Authorization value before deletion: ${existsBefore ? "exists" : "not found"}`
    );
    await this.authorizations.delete(key);
    const existsAfter = await this.authorizations.getAsync(key);
    this.logger.info(
      `Authorization value after deletion: ${existsAfter ? "still exists (ERROR!)" : "successfully deleted"}`
    );
  }

  /**
   * Revoke all persistent authorizations for an app
   */
  async revokeAppAuthorizations(appId: string) {
    const keysToDelete: string[] = [];
    for await (const [key, _] of this.authorizations.entriesAsync()) {
      const [authAppId] = key.split(":");
      if (authAppId === appId) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      await this.authorizations.delete(key);
    }

    this.logger.info(
      `Revoked all authorizations for appId ${appId} (${keysToDelete.length} keys deleted)`
    );
  }

  async storeTxSimulation(
    payloadHash: string,
    simulationResult: TxSimulationResult,
    txRequest: TxExecutionRequest
  ) {
    const data = jsonStringify({
      simulationResult,
      txRequest,
    });
    await this.txSimulations.set(payloadHash, data);
    this.logger.info(
      `Transaction simulation stored for payload hash ${payloadHash}`
    );
  }

  async getTxSimulation(
    payloadHash: string
  ): Promise<{ simulationResult: any; txRequest: any } | undefined> {
    const result = await this.txSimulations.getAsync(payloadHash);
    if (!result) {
      return undefined;
    }
    return JSON.parse(result);
  }

  async storeUtilityTrace(payloadHash: string, trace: any) {
    const data = jsonStringify({
      utilityTrace: trace,
    });
    await this.txSimulations.set(payloadHash, data);
    this.logger.info(`Utility trace stored for payload hash ${payloadHash}`);
  }

  async getUtilityTrace(payloadHash: string): Promise<any | undefined> {
    const result = await this.txSimulations.getAsync(payloadHash);
    if (!result) {
      return undefined;
    }
    const parsed = JSON.parse(result);
    return parsed.utilityTrace;
  }
}
