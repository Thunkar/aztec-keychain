import { type Account } from "@aztec/aztec.js/account";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { type Aliased, type SendOptions } from "@aztec/aztec.js/wallet";
import { type Fr } from "@aztec/aztec.js/fields";
import type { AccountType } from "../database/wallet-db";
import { WalletInteraction } from "../types/wallet-interaction";
import type { ExecutionPayload } from "@aztec/entrypoints/payload";

import { TxHash, TxSimulationResult } from "@aztec/stdlib/tx";
import type { DecodedExecutionTrace } from "../decoding/tx-callstack-decoder";
import { TxDecodingService } from "../decoding/tx-decoding-service";
import { DecodingCache } from "../decoding/decoding-cache";

import { inspect } from "node:util";
import { BaseNativeWallet } from "./base-native-wallet.ts";
import type { AuthorizationResponse } from "../types/authorization.ts";

// Enriched account type for internal use
export type InternalAccount = Aliased<AztecAddress> & { type: AccountType };

/**
 * 1. Skips all authorization checks (trusted internal GUI)
 * 2. Returns enriched data (e.g., account types)
 * 3. Provides additional internal-only methods
 */
export class InternalWallet extends BaseNativeWallet {
  // Override getAccountFromAddress to skip authorization check
  protected override async getAccountFromAddress(
    address: AztecAddress
  ): Promise<Account> {
    // Internal wallet is trusted, skip authorization and use base implementation
    return this.getAccountFromAddressInternal(address);
  }

  // Override getAccounts to return enriched data with account types
  override async getAccounts(): Promise<InternalAccount[]> {
    // Skip authorization via override above
    const accounts = await this.db.listAccounts();

    // Enrich with account type information
    return Promise.all(
      accounts.map(async (acc) => ({
        ...acc,
        type: (await this.db.retrieveAccount(acc.item)).type,
      }))
    );
  }

  override async registerSender(
    address: AztecAddress,
    alias: string
  ): Promise<AztecAddress> {
    // Store sender in database
    await this.db.storeSender(address, alias);
    // Register with PXE
    return await this.pxe.registerSender(address);
  }

  override async getAddressBook(): Promise<Aliased<AztecAddress>[]> {
    return this.getAddressBookInternal();
  }

  async createAccount(
    alias: string,
    type: AccountType,
    secret: Fr,
    salt: Fr,
    signingKey: Buffer
  ): Promise<void> {
    const interaction = WalletInteraction.from({
      type: "createAccount",
      status: "CREATING",
      complete: false,
      title: `Creating and deploying account ${alias}`,
    });
    await this.interactionManager.storeAndEmit(interaction);

    try {
      const accountManager = await this.getAccountManager(
        type,
        secret,
        salt,
        signingKey
      );
      await this.db.storeAccount(accountManager.address, {
        type,
        secretKey: secret,
        salt,
        alias,
        signingKey,
      });
      await this.interactionManager.storeAndEmit(
        interaction.update({
          status: "PROVING & SENDING DEPLOYMENT",
          description: `Address ${accountManager.address.toString()}`,
        })
      );

      const deployMethod = await accountManager.getDeployMethod();
      const { prepareForFeePayment } = await import(
        "../utils/sponsored-fpc.ts"
      );
      const paymentMethod = await prepareForFeePayment(this);
      const opts = {
        from: AztecAddress.ZERO,
        fee: {
          paymentMethod,
        },
        skipClassPublication: true,
        skipInstancePublication: true,
      };

      await deployMethod.send(opts).wait();
      await this.interactionManager.storeAndEmit(
        interaction.update({ status: "DEPLOYED", complete: true })
      );
    } catch (error: any) {
      // Update interaction with error status
      await this.interactionManager.storeAndEmit(
        interaction.update({
          status: "ERROR",
          complete: true,
          description: `Failed: ${error.message || String(error)}`,
        })
      );
      // Re-throw so the UI can also handle it
      throw error;
    }
  }

  override async sendTx(
    executionPayload: ExecutionPayload,
    opts: SendOptions
  ): Promise<TxHash> {
    const fee = await this.getDefaultFeeOptions(opts.from, opts.fee);
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(
      executionPayload,
      opts.from,
      fee
    );
    const provenTx = await this.pxe.proveTx(txRequest);
    const tx = await provenTx.toTx();
    const txHash = tx.getTxHash();
    if (await this.aztecNode.getTxEffect(txHash)) {
      throw new Error(
        `A settled tx with equal hash ${txHash.toString()} exists.`
      );
    }
    this.log.debug(`Sending transaction ${txHash}`);
    await this.aztecNode.sendTx(tx).catch((err) => {
      throw this.contextualizeError(err, inspect(tx));
    });
    this.log.info(`Sent transaction ${txHash}`);
    return txHash;
  }

  // Internal-only method: Delete account
  async deleteAccount(address: AztecAddress) {
    await this.db.deleteAccount(address);
  }

  // Internal-only: Get all interactions (unfiltered)
  getInteractions() {
    return this.db.listInteractions();
  }

  async getExecutionTrace(
    interactionId: string
  ): Promise<DecodedExecutionTrace | undefined> {
    // First check if it's a utility trace (simple trace)
    const utilityTrace = await this.db.getUtilityTrace(interactionId);
    if (utilityTrace) {
      return utilityTrace as DecodedExecutionTrace;
    }

    // Otherwise, retrieve the stored simulation result (full tx)
    const data = await this.db.getTxSimulation(interactionId);
    if (!data) {
      return undefined;
    }

    const decodingCache = new DecodingCache(this.pxe, this.db);
    const decodingService = new TxDecodingService(decodingCache);
    const parsedSimulationResult = TxSimulationResult.schema.parse(
      data.simulationResult
    );

    const { executionTrace } = await decodingService.decodeTransaction(
      parsedSimulationResult
    );
    return executionTrace;
  }

  // App authorization management methods
  async listAuthorizedApps(): Promise<string[]> {
    return await this.db.listAuthorizedApps();
  }

  async getAppAuthorizations(appId: string): Promise<{
    accounts: { alias: string; item: string }[];
    simulations: Array<{
      type: "simulateTx" | "simulateUtility";
      payloadHash: string;
      title?: string;
      key: string;
    }>;
    otherMethods: string[];
  }> {
    return await this.db.getAppAuthorizations(appId);
  }

  async updateAccountAuthorization(
    appId: string,
    accounts: Aliased<AztecAddress>[]
  ): Promise<void> {
    await this.db.updateAccountAuthorization(appId, accounts);
  }

  async updateAddressBookAuthorization(
    appId: string,
    contacts: Aliased<AztecAddress>[]
  ): Promise<void> {
    await this.db.updateAddressBookAuthorization(appId, contacts);
  }

  async revokeAuthorization(key: string): Promise<void> {
    await this.db.revokeAuthorization(key);
  }

  async revokeAppAuthorizations(appId: string): Promise<void> {
    await this.db.revokeAppAuthorizations(appId);
  }
}
