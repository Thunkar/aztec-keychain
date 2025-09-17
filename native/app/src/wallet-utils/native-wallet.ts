import {
  type Account,
  AccountManager,
  BaseWallet,
  SignerlessAccount,
  type SimulateMethodOptions,
  getContractInstanceFromInstantiationParams,
  TxHash,
  type ProfileMethodOptions,
} from "@aztec/aztec.js";
import { DefaultMultiCallEntrypoint } from "@aztec/entrypoints/multicall";
import type { ExecutionPayload } from "@aztec/entrypoints/payload";
import { Fr } from "@aztec/foundation/fields";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import {
  StubAccountContractArtifact,
  createStubAccount,
} from "@aztec/accounts/stub";
import type {
  TxProfileResult,
  TxProvingResult,
  TxSimulationResult,
} from "@aztec/stdlib/tx";
import { EcdsaRAccountContract } from "@aztec/accounts/ecdsa";
import { randomBytes } from "@aztec/foundation/crypto";
import { prepareForFeePayment } from "./sponsoredFPC";

export class NativeWallet extends BaseWallet {
  protected accounts: Map<string, Account> = new Map();

  protected async getAccountFromAddress(
    address: AztecAddress
  ): Promise<Account> {
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      const { l1ChainId: chainId, rollupVersion } =
        await this.pxe.getNodeInfo();
      account = new SignerlessAccount(
        new DefaultMultiCallEntrypoint(chainId, rollupVersion)
      );
    } else {
      account = this.accounts.get(address?.toString() ?? "");
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }

    return account;
  }

  getAccounts() {
    return Promise.resolve(
      Array.from(this.accounts.values()).map((acc) => ({
        alias: "",
        item: acc.getAddress(),
      }))
    );
  }

  async createAccount(): Promise<TxHash> {
    // Generate a random salt, secret key, and signing key
    const salt = Fr.random();
    const secret = Fr.random();
    const signingKey = randomBytes(32);

    // Create an ECDSA account
    const contract = new EcdsaRAccountContract(signingKey);
    const accountManager = await AccountManager.create(
      this,
      this.pxe,
      secret,
      contract,
      salt
    );

    this.accounts.set(
      accountManager.getAddress().toString(),
      await accountManager.getAccount()
    );

    const deployMethod = await accountManager.getDeployMethod();
    const feePaymentMethod = await prepareForFeePayment(this);
    const opts = {
      from: AztecAddress.ZERO,
      contractAddressSalt: salt,
      fee: {
        paymentMethod:
          await accountManager.getSelfPaymentMethod(feePaymentMethod),
      },
      universalDeploy: true,
      skipClassPublication: true,
      skipInstancePublication: true,
    };

    const tx = deployMethod.send(opts);
    await tx.wait();
    return tx.getTxHash();
  }

  async getFakeAccountDataFor(address: AztecAddress) {
    const nodeInfo = await this.pxe.getNodeInfo();
    const originalAccount = await this.getAccountFromAddress(address);
    const originalAddress = originalAccount.getCompleteAddress();
    const { contractInstance } = await this.pxe.getContractMetadata(
      originalAddress.address
    );
    if (!contractInstance) {
      throw new Error(
        `No contract instance found for address: ${originalAddress.address}`
      );
    }
    const stubAccount = createStubAccount(originalAddress, nodeInfo);
    const instance = await getContractInstanceFromInstantiationParams(
      StubAccountContractArtifact,
      {
        salt: Fr.random(),
      }
    );
    return {
      account: stubAccount,
      instance,
      artifact: StubAccountContractArtifact,
    };
  }

  override async simulateTx(
    executionPayload: ExecutionPayload,
    opts: SimulateMethodOptions
  ): Promise<TxSimulationResult> {
    if (!opts.fee) {
      opts.fee = {
        paymentMethod: await prepareForFeePayment(this),
      };
    }
    const executionOptions = { txNonce: Fr.random(), cancellable: false };
    const {
      account: fromAccount,
      instance,
      artifact,
    } = await this.getFakeAccountDataFor(opts.from);
    const fee = await this.getFeeOptions(
      fromAccount,
      executionPayload,
      opts.fee,
      executionOptions
    );
    const txRequest = await fromAccount.createTxExecutionRequest(
      executionPayload,
      fee,
      executionOptions
    );
    const contractOverrides = {
      [opts.from.toString()]: { instance, artifact },
    };
    return this.pxe.simulateTx(
      txRequest,
      true /* simulatePublic */,
      true,
      true,
      { contracts: contractOverrides }
    );
  }

  override async proveTx(
    exec: ExecutionPayload,
    opts: SimulateMethodOptions
  ): Promise<TxProvingResult> {
    opts.fee = {
      paymentMethod: await prepareForFeePayment(this),
    };

    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(
      exec,
      opts.from,
      opts.fee
    );
    return this.pxe.proveTx(txRequest);
  }

  override async profileTx(
    exec: ExecutionPayload,
    opts: ProfileMethodOptions
  ): Promise<TxProfileResult> {
    opts.fee = {
      paymentMethod: await prepareForFeePayment(this),
    };

    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(
      exec,
      opts.from,
      opts.fee
    );
    return this.pxe.profileTx(
      txRequest,
      opts.profileMode,
      opts.skipProofGeneration ?? true
    );
  }
}
