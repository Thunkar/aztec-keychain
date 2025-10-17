import { AztecAddress, Fr, Fq, type Aliased } from "@aztec/aztec.js";
import { type LogFn } from "@aztec/foundation/log";
import { type AztecAsyncMap, type AztecAsyncKVStore } from "@aztec/kv-store";
import {
  WalletInteraction,
  type WalletInteractionType,
} from "./wallet-interaction";
import { jsonStringify } from "@aztec/foundation/json-rpc";
import { TxSimulationResult } from "@aztec/stdlib/tx";

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
    private simulationResults: AztecAsyncMap<string, string>,
    private userLog: LogFn
  ) {}

  static init(store: AztecAsyncKVStore, userLog: LogFn) {
    const accounts = store.openMap<string, Buffer>("accounts");
    const aliases = store.openMap<string, Buffer>("aliases");
    const bridgedFeeJuice = store.openMap<string, Buffer>("bridgedFeeJuice");
    const interactions = store.openMap<string, Buffer>("interactions");
    const authorizations = store.openMap<string, Buffer>("authorizations");
    const simulationResults = store.openMap<string, string>(
      "simulationResults"
    );
    return new WalletDB(
      accounts,
      aliases,
      bridgedFeeJuice,
      interactions,
      authorizations,
      simulationResults,
      userLog
    );
  }

  async pushBridgedFeeJuice(
    recipient: AztecAddress,
    secret: Fr,
    amount: bigint,
    leafIndex: bigint,
    log: LogFn = this.userLog
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
    log(
      `Pushed ${amount} fee juice for recipient ${recipient.toString()}. Stack pointer ${stackPointer}`
    );
  }

  async popBridgedFeeJuice(recipient: AztecAddress, log: LogFn = this.userLog) {
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
    log(
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
    },
    log: LogFn = this.userLog
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
    log(
      `Account stored in database with alias${alias ? `es last & ${alias}` : " last"}`
    );
  }

  async storeSender(
    address: AztecAddress,
    alias: string,
    log: LogFn = this.userLog
  ) {
    await this.aliases.set(`senders:${alias}`, Buffer.from(address.toString()));
    log(`Sender stored in database with alias ${alias}`);
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
    return result;
  }

  async storePersistentAuthorization(
    appId: string,
    method: string,
    data: any,
    log: LogFn = this.userLog
  ) {
    const key = `${appId}:${method}`;
    await this.authorizations.set(key, Buffer.from(jsonStringify(data)));
    log(`Persistent authorization stored for appId ${appId}, method ${method}`);
  }

  async retrievePersistentAuthorization(
    appId: string,
    method: string
  ): Promise<any | undefined> {
    const key = `${appId}:${method}`;
    const result = await this.authorizations.getAsync(key);
    if (!result) {
      return undefined;
    }
    return JSON.parse(result.toString());
  }

  async storeBatchPersistentAuthorizations(
    appId: string,
    itemResponses: Record<string, any>,
    itemMethods: Map<string, string>,
    log: LogFn = this.userLog
  ) {
    for (const [itemId, response] of Object.entries(itemResponses)) {
      if (response.approved && response.data?.persistent) {
        const method = itemMethods.get(itemId);
        if (method) {
          await this.storePersistentAuthorization(
            appId,
            method,
            response.data,
            log
          );
        }
      }
    }
  }

  async storeSimulationResult(
    interactionId: string,
    simulationResult: TxSimulationResult,
    log: LogFn = this.userLog
  ) {
    await this.simulationResults.set(
      interactionId,
      jsonStringify(simulationResult)
    );
    log(`Simulation result stored for interaction ${interactionId}`);
  }

  async getSimulationResult(interactionId: string): Promise<any | undefined> {
    const result = await this.simulationResults.getAsync(interactionId);
    if (!result) {
      return undefined;
    }
    return JSON.parse(result);
  }
}
