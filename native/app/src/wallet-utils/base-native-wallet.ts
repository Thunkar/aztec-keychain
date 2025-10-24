import {
  type Account,
  AccountManager,
  AztecAddress,
  BaseWallet,
  Fq,
  Fr,
  getContractInstanceFromInstantiationParams,
  SignerlessAccount,
  type AztecNode,
  type ChainInfo,
  type FeeOptions,
  type Logger,
  type UserFeeOptions,
} from "@aztec/aztec.js";
import { DecodingCache } from "./decoding/decoding-cache";
import type { PXE } from "@aztec/pxe/server";
import type { AccountType, WalletDB } from "./wallet_db";
import type { PromiseWithResolvers } from "@aztec/foundation/promise";
import type {
  AuthorizationRequest,
  AuthorizationResponse,
} from "./authorization";
import {
  WalletUpdateEvent,
  type WalletInteraction,
  type WalletInteractionType,
} from "./wallet-interaction";
import { prepareForFeePayment } from "./sponsoredFPC";
import { AccountFeePaymentMethodOptions } from "@aztec/entrypoints/account";
import { GasSettings } from "@aztec/stdlib/gas";
import {
  EcdsaKAccountContract,
  EcdsaRAccountContract,
} from "@aztec/accounts/ecdsa";
import { SchnorrAccountContract } from "@aztec/accounts/schnorr";
import {
  createStubAccount,
  StubAccountContractArtifact,
} from "@aztec/accounts/stub";

/**
 * Base class for native wallet implementations (external and internal).
 * Provides common functionality for both trusted and untrusted wallet contexts.
 *
 * This class handles:
 * - Event emission (EventTarget implementation for wallet updates)
 * - Interaction tracking and storage
 * - Account management and creation
 * - Fee calculation and payment method setup
 * - Contract name resolution via shared decoding cache
 *
 * Subclasses must implement authorization logic appropriate to their trust level:
 * - ExternalWallet: Requires user authorization for all operations
 * - InternalWallet: Auto-approves all operations (trusted GUI)
 */
export abstract class BaseNativeWallet
  extends BaseWallet
  implements EventTarget
{
  private eventEmitter = new EventTarget();
  protected decodingCache: DecodingCache;

  constructor(
    pxe: PXE,
    node: AztecNode,
    protected db: WalletDB,
    protected pendingAuthorizations: Map<
      string,
      {
        promise: PromiseWithResolvers<AuthorizationResponse>;
        request: AuthorizationRequest;
      }
    >,
    protected appId: string,
    protected chainInfo: ChainInfo,
    protected override log: Logger
  ) {
    super(pxe, node);
    // Create a single decoding cache instance shared across all wallet operations
    // This cache stores contract names, artifacts, and aliases to avoid repeated PXE lookups
    this.decodingCache = new DecodingCache(pxe, db);
  }

  /**
   * Creates an AccountManager for a given account type and signing key.
   *
   * This method:
   * 1. Instantiates the appropriate account contract (Schnorr, ECDSA K-256, ECDSA R-1)
   * 2. Creates an AccountManager with the contract
   * 3. Registers the account contract with PXE for simulation/execution
   *
   * @param type - Account type (schnorr, ecdsasecp256k1, ecdsasecp256r1)
   * @param secret - Account secret key
   * @param salt - Deployment salt
   * @param signingKey - Signing key for the account
   * @returns AccountManager for this account
   */
  protected async getAccountManager(
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

  /**
   * Internal implementation for retrieving an account by address.
   *
   * This method handles the actual account retrieval logic:
   * - For ZERO address: Returns a signerless account
   * - For other addresses: Retrieves account data from DB and creates AccountManager
   *
   * Subclasses should wrap this with authorization checks as needed.
   *
   * @param address - The account address to retrieve
   * @returns Account instance for the given address
   */
  protected async getAccountFromAddressInternal(
    address: AztecAddress
  ): Promise<Account> {
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      const chainInfo = await this.getChainInfo();
      account = new SignerlessAccount(chainInfo);
    } else {
      const { secretKey, salt, signingKey, type } =
        await this.db.retrieveAccount(address);
      const accountManager = await this.getAccountManager(
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

  /**
   * Creates a "fake" stub account for simulation purposes.
   *
   * Used during transaction simulation to bypass actual signature generation
   * while maintaining the correct account address and contract interface.
   * The stub account allows simulating transactions without access to the real private key.
   *
   * @param address - The real account address to create a stub for
   * @returns Stub account, instance, and artifact for simulation
   */
  protected async getFakeAccountDataFor(address: AztecAddress) {
    const chainInfo = await this.getChainInfo();
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
    const stubAccount = createStubAccount(originalAddress, chainInfo);
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

  override async getDefaultFeeOptions(
    from: AztecAddress,
    userFeeOptions: UserFeeOptions | undefined
  ): Promise<FeeOptions> {
    const maxFeesPerGas =
      userFeeOptions?.gasSettings?.maxFeesPerGas ??
      (await this.aztecNode.getCurrentBaseFees()).mul(1 + this.baseFeePadding);
    let walletFeePaymentMethod;
    let accountFeePaymentMethodOptions;
    // The transaction does not include a fee payment method, so we set a default
    if (!userFeeOptions?.embeddedPaymentMethodFeePayer) {
      walletFeePaymentMethod = await prepareForFeePayment(this);
      accountFeePaymentMethodOptions = AccountFeePaymentMethodOptions.EXTERNAL;
    } else {
      // The transaction includes fee payment method, so we check if we are the fee payer for it
      // (this can only happen if the embedded payment method is FeeJuiceWithClaim)
      accountFeePaymentMethodOptions = from.equals(
        userFeeOptions.embeddedPaymentMethodFeePayer
      )
        ? AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM
        : AccountFeePaymentMethodOptions.EXTERNAL;
    }
    const gasSettings: GasSettings = GasSettings.default({
      ...userFeeOptions?.gasSettings,
      maxFeesPerGas,
    });
    this.log.debug(`Using L2 gas settings`, gasSettings);
    return {
      gasSettings,
      walletFeePaymentMethod,
      accountFeePaymentMethodOptions,
    };
  }

  override getChainInfo(): Promise<ChainInfo> {
    return Promise.resolve(this.chainInfo);
  }

  // ============================================================================
  // EventTarget Implementation
  // ============================================================================
  // Delegates to internal EventTarget emitter.
  // Allows external code to listen for wallet events (interactions, auth requests).

  dispatchEvent(event: Event): boolean {
    return this.eventEmitter.dispatchEvent(event);
  }

  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    return this.eventEmitter.addEventListener(type, callback, options);
  }

  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void {
    return this.eventEmitter.removeEventListener(type, callback, options);
  }

  /**
   * Stores an interaction in the database and emits an update event.
   *
   * Interactions track the lifecycle of wallet operations (sending tx, registering contracts, etc.)
   * and are displayed in the UI. This method persists the interaction and notifies listeners.
   *
   * @param interaction - The interaction to store and emit
   * @returns The same interaction (for chaining)
   */
  async storeAndEmitInteraction(
    interaction: WalletInteraction<WalletInteractionType>
  ) {
    await this.db.createOrUpdateInteraction(interaction);
    this.dispatchEvent(new WalletUpdateEvent(interaction));
    return interaction;
  }

  /**
   * Resolves a pending authorization request with a user response.
   *
   * Called by the UI when the user approves/denies an authorization dialog.
   * Completes the promise that the wallet is waiting on, allowing the operation to proceed or fail.
   *
   * @param response - Authorization response from user interaction
   */
  resolveAuthorization(response: AuthorizationResponse) {
    const pending = this.pendingAuthorizations.get(response.id);
    if (pending) {
      pending.promise.resolve(response);
      this.pendingAuthorizations.delete(response.id);
    }
  }
}
