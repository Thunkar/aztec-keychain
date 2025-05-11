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
import { EcdsaRSerialBaseAccountContract } from './account_contract.js';

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256r1 public key stored in an immutable encrypted note.
 * Since this implementation relays signatures to a webserial device, we provide the
 * public key here not for signature verification, but to identify actual identity
 * that will be used to sign authwitnesses.
 * Lazily loads the contract artifact through the serial port
 */
export class EcdsaRSerialAccountContract extends EcdsaRSerialBaseAccountContract {
  private static _artifact: ContractArtifact | undefined;

  constructor(signingPublicKey: Buffer) {
    super(signingPublicKey);
  }

  override async getContractArtifact(): Promise<ContractArtifact> {
    if (!EcdsaRSerialAccountContract._artifact) {
      const {
        data: { data },
      } = await sendCommandAndParseResponse({
        type: CommandType.GET_ARTIFACT_REQUEST,
        data: {},
      });
      EcdsaRSerialAccountContract._artifact = data as ContractArtifact;
    }
    return EcdsaRSerialAccountContract._artifact;
  }
}

/**
 * Creates an Account that relies on an ECDSA signing key for authentication.
 * @param pxe - An PXE server instance.
 * @param index - Index of the account stored in the webserial device.
 * @returns An account manager initialized with the account contract and its deployment params
 */
export async function getEcdsaRSerialAccount(pxe: PXE, index: number): Promise<AccountManager> {
  const accountResponse = await sendCommandAndParseResponse({
    type: CommandType.GET_ACCOUNT_REQUEST,
    data: { index },
  });
  if (accountResponse.type !== CommandType.GET_ACCOUNT_RESPONSE) {
    throw new Error(
      `Unexpected response type from HW wallet: ${accountResponse.type}. Expected ${CommandType.GET_ACCOUNT_RESPONSE}`,
    );
  }
  const signingPublicKey = Buffer.from(accountResponse.data.pk);
  const secretKey = Fr.fromBufferReduce(Buffer.from(accountResponse.data.msk));
  const salt = Fr.fromBufferReduce(Buffer.from(accountResponse.data.salt));
  return AccountManager.create(pxe, secretKey, new EcdsaRSerialAccountContract(signingPublicKey), salt);
}

/**
 * Gets a wallet for an already registered account using ECDSA signatures.
 * @param pxe - An PXE server instance.
 * @param index - Index of the account stored in the webserial device.
 * @returns A wallet for this account that can be used to interact with a contract instance.
 */
export async function getEcdsaRSerialWallet(pxe: PXE, address: AztecAddress, index: number): Promise<AccountWallet> {
  const accountResponse = await sendCommandAndParseResponse({
    type: CommandType.GET_ACCOUNT_REQUEST,
    data: { index },
  });
  if (accountResponse.type !== CommandType.GET_ACCOUNT_RESPONSE) {
    throw new Error(
      `Unexpected response type from HW wallet: ${accountResponse.type}. Expected ${CommandType.GET_ACCOUNT_RESPONSE}`,
    );
  }
  const signingPublicKey = Buffer.from(accountResponse.data.pk);
  return getWallet(pxe, address, new EcdsaRSerialAccountContract(signingPublicKey));
}
