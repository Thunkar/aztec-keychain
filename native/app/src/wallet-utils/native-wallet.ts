import {
  type Account,
  AccountManager,
  BaseWallet,
  SignerlessAccount,
  type SimulateOptions,
  getContractInstanceFromInstantiationParams,
  TxHash,
  type DeployAccountOptions,
  type AztecNode,
  type Aliased,
} from "@aztec/aztec.js";
import { DefaultMultiCallEntrypoint } from "@aztec/entrypoints/multicall";
import {
  ExecutionPayload,
  mergeExecutionPayloads,
} from "@aztec/entrypoints/payload";
import { Fq, Fr } from "@aztec/foundation/fields";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import {
  StubAccountContractArtifact,
  createStubAccount,
} from "@aztec/accounts/stub";
import type { TxSimulationResult } from "@aztec/stdlib/tx";
import {
  EcdsaKAccountContract,
  EcdsaRAccountContract,
} from "@aztec/accounts/ecdsa";
import { SchnorrAccountContract } from "@aztec/accounts/schnorr";
import { prepareForFeePayment } from "./sponsoredFPC";
import { type PXE } from "@aztec/pxe/server";
import { WalletDB, type AccountType } from "./wallet_db";

export class NativeWallet extends BaseWallet {
  constructor(
    pxe: PXE,
    node: AztecNode,
    private db: WalletDB,
    private appId: string
  ) {
    super(pxe, node);
  }

  protected async getAccountFromAddress(
    address: AztecAddress
  ): Promise<Account> {
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      const { l1ChainId: chainId, rollupVersion } =
        await this.aztecNode.getNodeInfo();
      account = new SignerlessAccount(
        new DefaultMultiCallEntrypoint(chainId, rollupVersion)
      );
    } else {
      const { secretKey, salt, signingKey, type } =
        await this.db.retrieveAccount(address);
      const accountManager = await this.createAccountInternal(
        type,
        secretKey,
        salt,
        signingKey
      );
      account = await accountManager.getAccount();
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }

    return account;
  }

  private async createAccountInternal(
    type: AccountType,
    secret: Fr,
    salt: Fr,
    signingKey: Buffer
  ): Promise<AccountManager> {
    let contract;
    switch (type) {
      case "schnorr": {
        contract = new SchnorrAccountContract(Fq.fromBuffer(signingKey));
        break;
      }
      case "ecdsasecp256k1": {
        contract = new EcdsaKAccountContract(signingKey);
        break;
      }
      case "ecdsasecp256r1": {
        contract = new EcdsaRAccountContract(signingKey);
        break;
      }
      default: {
        throw new Error(`Unknown account type ${type}`);
      }
    }

    const accountManager = await AccountManager.create(
      this,
      secret,
      contract,
      salt
    );

    const instance = await accountManager.getInstance();
    const artifact = await accountManager
      .getAccountContract()
      .getContractArtifact();

    await this.registerContract(
      instance,
      artifact,
      accountManager.getSecretKey()
    );

    return accountManager;
  }

  async createAccount(
    alias: string,
    type: AccountType,
    secret: Fr,
    salt: Fr,
    signingKey: Buffer
  ): Promise<TxHash> {
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
    const deployMethod = await accountManager.getDeployMethod();
    const paymentMethod = await prepareForFeePayment(this);
    const opts: DeployAccountOptions = {
      from: AztecAddress.ZERO,
      fee: {
        paymentMethod,
      },
      skipClassPublication: true,
      skipInstancePublication: true,
    };

    const tx = deployMethod.send(opts);
    await tx.wait();
    return tx.getTxHash();
  }

  getAccounts() {
    return this.db.listAccounts();
  }

  override async registerSender(address: AztecAddress, alias: string) {
    await this.db.storeSender(address, alias);
    return this.pxe.registerSender(address);
  }

  override async getSenders(): Promise<Aliased<AztecAddress>[]> {
    const senders = await this.pxe.getSenders();
    const storedSenders = await this.db.listSenders();
    for (const storedSender of storedSenders) {
      if (
        senders.findIndex((sender) => sender.equals(storedSender.item)) === -1
      ) {
        await this.pxe.registerSender(storedSender.item);
      }
    }
    return storedSenders;
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
    opts: SimulateOptions
  ): Promise<TxSimulationResult> {
    let simulationResults;
    const feeOptions = opts.fee?.estimateGas
      ? await this.getFeeOptionsForGasEstimation(opts.from, opts.fee)
      : await this.getDefaultFeeOptions(opts.from, opts.fee);
    const feeExecutionPayload =
      await feeOptions.paymentMethod?.getExecutionPayload();
    const executionOptions = {
      txNonce: Fr.random(),
      cancellable: this.cancellableTransactions,
      isFeePayer: feeOptions.isFeePayer,
      endSetup: feeOptions.endSetup,
    };
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
      : executionPayload;
    // Kernelless simulations using the multicall entrypoints are not currently supported,
    // since we only override proper account contracts.
    // TODO: allow disabling kernels even when no overrides are necessary
    if (opts.from.equals(AztecAddress.ZERO)) {
      const fromAccount = await this.getAccountFromAddress(opts.from);
      const txRequest = await fromAccount.createTxExecutionRequest(
        finalExecutionPayload,
        feeOptions.gasSettings,
        executionOptions
      );
      simulationResults = await this.pxe.simulateTx(
        txRequest,
        true /* simulatePublic */,
        opts?.skipTxValidation,
        opts?.skipFeeEnforcement ?? true
      );
    } else {
      const {
        account: fromAccount,
        instance,
        artifact,
      } = await this.getFakeAccountDataFor(opts.from);
      const txRequest = await fromAccount.createTxExecutionRequest(
        finalExecutionPayload,
        feeOptions.gasSettings,
        executionOptions
      );
      const contractOverrides = {
        [opts.from.toString()]: { instance, artifact },
      };
      simulationResults = await this.pxe.simulateTx(
        txRequest,
        true /* simulatePublic */,
        true,
        true,
        {
          contracts: contractOverrides,
        }
      );
    }
    return simulationResults;
  }
}
