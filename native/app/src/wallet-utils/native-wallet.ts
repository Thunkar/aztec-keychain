import {
  type Account,
  AccountManager,
  BaseWallet,
  SignerlessAccount,
  type SimulateOptions,
  getContractInstanceFromInstantiationParams,
  TxHash,
  type DeployAccountOptions,
  type FeeOptions,
  type WalletFeeOptions,
  type AztecNode,
} from "@aztec/aztec.js";
import { DefaultMultiCallEntrypoint } from "@aztec/entrypoints/multicall";
import {
  ExecutionPayload,
  mergeExecutionPayloads,
} from "@aztec/entrypoints/payload";
import { Fr } from "@aztec/foundation/fields";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import {
  StubAccountContractArtifact,
  createStubAccount,
} from "@aztec/accounts/stub";
import type { TxSimulationResult } from "@aztec/stdlib/tx";
import { GasSettings } from "@aztec/stdlib/gas";
import { EcdsaRAccountContract } from "@aztec/accounts/ecdsa";
import { randomBytes } from "@aztec/foundation/crypto";
import { prepareForFeePayment } from "./sponsoredFPC";
import {
  type PXEConfig,
  type PXECreationOptions,
  createPXE,
  getPXEConfig,
} from "@aztec/pxe/server";

export class NativeWallet extends BaseWallet {
  protected accounts: Map<string, Account> = new Map();

  static async create(
    node: AztecNode,
    overridePXEConfig?: Partial<PXEConfig>,
    options: PXECreationOptions = { loggers: {} }
  ): Promise<NativeWallet> {
    const pxeConfig = Object.assign(getPXEConfig(), {
      proverEnabled: overridePXEConfig?.proverEnabled ?? false,
      ...overridePXEConfig,
    });
    const pxe = await createPXE(node, pxeConfig, options);
    return new NativeWallet(pxe, node);
  }

  protected async getAccountFromAddress(
    address: AztecAddress
  ): Promise<Account> {
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      const chainInfo = await this.getChainInfo();
      account = new SignerlessAccount(
        new DefaultMultiCallEntrypoint(
          chainInfo.chainId.toNumber(),
          chainInfo.version.toNumber()
        )
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
      secret,
      contract,
      salt
    );

    const instance = await accountManager.getInstance();
    const artifact = await contract.getContractArtifact();

    await this.pxe.registerContract({ artifact, instance });
    await this.pxe.registerAccount(
      secret,
      (await accountManager.getCompleteAddress()).partialAddress
    );

    this.accounts.set(
      accountManager.getAddress().toString(),
      await accountManager.getAccount()
    );

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

  protected async getDefaultFeeOptions(
    address: AztecAddress,
    walletFeeOptions?: WalletFeeOptions
  ): Promise<FeeOptions> {
    const maxFeesPerGas =
      walletFeeOptions?.gasSettings?.maxFeesPerGas ??
      (await this.aztecNode.getCurrentBaseFees()).mul(1 + this.baseFeePadding);
    const paymentMethod = !walletFeeOptions?.embeddedPaymentMethodFeePayer
      ? await prepareForFeePayment(this)
      : undefined;
    const gasSettings: GasSettings = GasSettings.default({
      ...walletFeeOptions?.gasSettings,
      maxFeesPerGas,
    });
    this.log.debug(`Using L2 gas settings`, gasSettings);
    return {
      gasSettings,
      paymentMethod,
      embeddedPaymentMethodFeePayer:
        walletFeeOptions?.embeddedPaymentMethodFeePayer,
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
    const maybeFeePayer =
      (await feeOptions.paymentMethod?.getFeePayer()) ??
      opts.fee?.embeddedPaymentMethodFeePayer;
    const isFeePayer = !!maybeFeePayer && maybeFeePayer.equals(opts.from);
    // Either there is no fee execution payload and we're the fee payer (embedded fee juice payment in the interaction)
    // Or the fee payment method has no calls and we're the fee payer (wallet injected fee juice payment)
    const endSetup =
      (!feeExecutionPayload || feeExecutionPayload.calls.length === 0) &&
      isFeePayer;
    const executionOptions = {
      txNonce: Fr.random(),
      cancellable: true,
      isFeePayer,
      endSetup,
    };
    const combinedExecutionPayload = mergeExecutionPayloads([
      feeExecutionPayload ?? ExecutionPayload.empty(),
      executionPayload,
    ]);
    // Kernelless simulations using the multicall entrypoints are not currently supported,
    // since we only override proper account contracts.
    // TODO: allow disabling kernels even when no overrides are necessary
    if (opts.from.equals(AztecAddress.ZERO)) {
      const fromAccount = await this.getAccountFromAddress(opts.from);
      const txRequest = await fromAccount.createTxExecutionRequest(
        combinedExecutionPayload,
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
        combinedExecutionPayload,
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
