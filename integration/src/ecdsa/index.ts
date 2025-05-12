/**
 * The `@aztec/accounts/ecdsa` export provides an ECDSA account contract implementation, that uses an ECDSA private key for authentication, and a Grumpkin key for encryption.
 * Consider using this account type when working with integrations with Ethereum wallets.
 *
 * @packageDocumentation
 */
import { AccountManager } from '@aztec/aztec.js/account';
import { type AccountWallet, getWallet } from '@aztec/aztec.js/wallet';
import { Fr } from '@aztec/aztec.js/fields';
import { type ContractArtifact, loadContractArtifact } from '@aztec/aztec.js/abi';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { PXE } from '@aztec/aztec.js/interfaces';

import { CommandType, sendCommandAndParseResponse } from '../utils/web_serial.js';
import { createLogger, type Logger } from '@aztec/aztec.js/log';
import type { AuthWitnessProvider } from '@aztec/aztec.js/account';
import { EcdsaSignature, sha256 } from '@aztec/foundation/crypto';

import type { CompleteAddress } from '@aztec/aztec.js/addresses';
import { DefaultAccountContract } from '@aztec/accounts/defaults';
import { AuthWitness } from '@aztec/stdlib/auth-witness';

const secp256r1N = 115792089210356248762697446949407573529996955224135760342422259061068512044369n;

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256r1 public key stored in an immutable encrypted note.
 * Since this implementation relays signatures to a webserial device, we provide the
 * public key here not for signature verification, but to identify actual identity
 * that will be used to sign authwitnesses.
 * Lazily loads the contract artifact through the serial port
 */
export class EcdsaRSerialAccountContract extends DefaultAccountContract {
  private artifact: ContractArtifact | undefined;

  constructor(
    private signingPublicKey: Buffer,
    private index: number,
    private logger: Logger,
  ) {
    super();
  }

  override async getContractArtifact(): Promise<ContractArtifact> {
    if (!this.artifact) {
      const {
        data: { data },
      } = await sendCommandAndParseResponse(
        {
          type: CommandType.GET_ARTIFACT_REQUEST,
          data: {},
        },
        this.logger,
      );
      this.artifact = loadContractArtifact(data);
    }
    return this.artifact;
  }

  override getDeploymentFunctionAndArgs() {
    return Promise.resolve({
      constructorName: 'constructor',
      constructorArgs: [this.signingPublicKey.subarray(0, 32), this.signingPublicKey.subarray(32, 64)],
    });
  }

  override getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new SerialEcdsaRAuthWitnessProvider(this.signingPublicKey, this.index, this.logger);
  }
}

/** Creates auth witnesses using ECDSA signatures. */
class SerialEcdsaRAuthWitnessProvider implements AuthWitnessProvider {
  constructor(
    private signingPublicKey: Buffer,
    private index: number,
    private logger: Logger,
  ) {}

  #parseECDSASignature(data: number[]) {
    // Extract ECDSA signature components
    const r = Buffer.from(data.slice(0, 32));
    let s = Buffer.from(data.slice(32, 64));

    const maybeHighS = BigInt(`0x${s.toString('hex')}`);

    // ECDSA signatures must have a low S value so they can be used as a nullifier. BB forces a value of 27 for v, so
    // only one PublicKey can verify the signature (and not its negated counterpart) https://ethereum.stackexchange.com/a/55728
    if (maybeHighS > secp256r1N / 2n + 1n) {
      s = Buffer.from((secp256r1N - maybeHighS).toString(16), 'hex');
    }

    return new EcdsaSignature(r, s, Buffer.from([0]));
  }

  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    const signRequest = {
      type: CommandType.SIGNATURE_REQUEST,
      data: {
        index: this.index,
        pk: Array.from(this.signingPublicKey),
        msg: Array.from(sha256(messageHash.toBuffer())),
      },
    };

    const response = await sendCommandAndParseResponse(signRequest, this.logger);

    if (response.type !== CommandType.SIGNATURE_ACCEPTED_RESPONSE) {
      throw new Error(
        `Unexpected response type from HW wallet: ${response.type}. Expected ${CommandType.SIGNATURE_ACCEPTED_RESPONSE}`,
      );
    }

    const signature = this.#parseECDSASignature(response.data.signature);
    return new AuthWitness(messageHash, [...signature.r, ...signature.s]);
  }
}

/**
 * Creates an Account that relies on an ECDSA signing key for authentication.
 * @param pxe - An PXE server instance.
 * @param index - Index of the account stored in the webserial device.
 * @returns An account manager initialized with the account contract and its deployment params
 */
export async function getEcdsaRSerialAccount(
  pxe: PXE,
  index = -1,
): Promise<{ index: number; manager: AccountManager }> {
  const logger = createLogger('aztec-keychain');

  const accountResponse = await sendCommandAndParseResponse(
    {
      type: CommandType.GET_ACCOUNT_REQUEST,
      data: { index },
    },
    logger,
  );
  if (accountResponse.type !== CommandType.GET_ACCOUNT_RESPONSE) {
    throw new Error(
      `Unexpected response type from HW wallet: ${accountResponse.type}. Expected ${CommandType.GET_ACCOUNT_RESPONSE}`,
    );
  }
  const signingPublicKey = Buffer.from(accountResponse.data.pk);
  const secretKey = Fr.fromBufferReduce(Buffer.from(accountResponse.data.msk));
  const salt = Fr.fromBufferReduce(Buffer.from(accountResponse.data.salt));
  return {
    index: accountResponse.data.index,
    manager: await AccountManager.create(
      pxe,
      secretKey,
      new EcdsaRSerialAccountContract(signingPublicKey, accountResponse.data.index, logger),
      salt,
    ),
  };
}

/**
 * Gets a wallet for an already registered account using ECDSA signatures.
 * @param pxe - An PXE server instance.
 * @param index - Index of the account stored in the webserial device.
 * @returns A wallet for this account that can be used to interact with a contract instance.
 */
export async function getEcdsaRSerialWallet(pxe: PXE, address: AztecAddress, index = -1): Promise<AccountWallet> {
  const logger = createLogger('aztec-keychain');

  const accountResponse = await sendCommandAndParseResponse(
    {
      type: CommandType.GET_ACCOUNT_REQUEST,
      data: { index },
    },
    logger,
  );
  if (accountResponse.type !== CommandType.GET_ACCOUNT_RESPONSE) {
    throw new Error(
      `Unexpected response type from HW wallet: ${accountResponse.type}. Expected ${CommandType.GET_ACCOUNT_RESPONSE}`,
    );
  }
  const signingPublicKey = Buffer.from(accountResponse.data.pk);
  return getWallet(pxe, address, new EcdsaRSerialAccountContract(signingPublicKey, accountResponse.data.index, logger));
}
