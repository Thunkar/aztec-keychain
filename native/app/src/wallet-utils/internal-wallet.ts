import {
  AztecAddress,
  type Aliased,
  type Fr,
  type SendOptions,
} from "@aztec/aztec.js";
import { ExternalWallet } from "./external-wallet";
import type { AccountType } from "./wallet_db";
import type {
  AuthorizationData,
  GetAccountsAuthData,
} from "./authorization";
import { WalletInteraction } from "./wallet-interaction";
import type { ExecutionPayload } from "@aztec/entrypoints/payload";

import { type TxProvingResult } from "@aztec/stdlib/tx";

// Enriched account type for internal use
export type InternalAccount = Aliased<AztecAddress> & { type: AccountType };

/**
 * InternalWallet extends ExternalWallet but:
 * 1. Skips all authorization checks (trusted internal GUI)
 * 2. Returns enriched data (e.g., account types)
 * 3. Provides additional internal-only methods
 */
export class InternalWallet extends ExternalWallet {
  // Override authorization to always approve instantly
  protected override async requestAuthorization(
    method: string,
    _params: any,
    _persistent = false
  ): Promise<AuthorizationData> {
    // Internal requests are always pre-approved
    // Return the appropriate data structure based on the method

    if (method === "getAccounts") {
      // For getAccounts, return all accounts
      const accounts = await super.getAccounts();
      return { accounts } as GetAccountsAuthData;
    }

    // For other methods, return undefined (no special data needed)
    return undefined;
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
      title: `Registering and creating account ${alias}`,
    });
    await this.storeAndEmitInteraction(interaction);

    const accountManager = await this.createAccountInternal(
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
    await this.storeAndEmitInteraction(
      interaction.update({
        status: "CREATED",
        description: `Address ${accountManager.address.toString()}`,
      })
    );

    const deployMethod = await accountManager.getDeployMethod();
    const { prepareForFeePayment } = await import("./sponsoredFPC");
    const paymentMethod = await prepareForFeePayment(this);
    const opts = {
      from: AztecAddress.ZERO,
      fee: {
        paymentMethod,
      },
      skipClassPublication: true,
      skipInstancePublication: true,
    };

    const provenTx = await deployMethod.prove(opts);
    await this.storeAndEmitInteraction(
      interaction.update({ status: "PROVEN" })
    );
    await provenTx.send().wait();
    await this.storeAndEmitInteraction(
      interaction.update({ status: "DEPLOYED", complete: true })
    );
  }

  override async proveTx(
    exec: ExecutionPayload,
    opts: SendOptions
  ): Promise<TxProvingResult> {
    const fee = await this.getDefaultFeeOptions(opts.from, opts.fee);
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(
      exec,
      opts.from,
      fee
    );
    return this.pxe.proveTx(txRequest);
  }

  // Internal-only method: Delete account
  async deleteAccount(address: AztecAddress) {
    await this.db.deleteAccount(address);
  }

  // Internal-only: Get all interactions (unfiltered)
  getInteractions() {
    return this.db.listInteractions();
  }
}
