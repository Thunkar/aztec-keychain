import { GeneratorIndex } from "@aztec/constants";
import { Fq, Fr } from "./crypto/fields";
import { sha512ToGrumpkinScalar } from "./crypto/sha512";
import { poseidon2HashWithSeparator } from "./crypto/poseidon2";
import { Grumpkin } from "./crypto/grumpkin";
import { PublicKeys } from "./keys/public_keys";

export async function deriveMasterNullifierSecretKey(secretKey: Fr) {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.NSK_M]);
}

export function deriveMasterIncomingViewingSecretKey(secretKey: Fr) {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.IVSK_M]);
}

export function deriveMasterOutgoingViewingSecretKey(secretKey: Fr) {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.OVSK_M]);
}

export function computePreaddress(publicKeysHash: Fr, partialAddress: Fr) {
  return poseidon2HashWithSeparator(
    [publicKeysHash, partialAddress],
    GeneratorIndex.CONTRACT_ADDRESS_V1
  );
}

export async function computeAddress(
  publicKeys: PublicKeys,
  partialAddress: Fr
): Promise<Fr> {
  // Given public keys and a partial address, we can compute our address in the following steps.
  // 1. preaddress = poseidon2([publicKeysHash, partialAddress], GeneratorIndex.CONTRACT_ADDRESS_V1);
  // 2. addressPoint = (preaddress * G) + ivpk_m
  // 3. address = addressPoint.x
  const preaddress = await computePreaddress(
    await publicKeys.hash(),
    partialAddress
  );
  const address = await new Grumpkin().add(
    await derivePublicKeyFromSecretKey(new Fq(preaddress.toBigInt())),
    publicKeys.masterIncomingViewingPublicKey
  );

  return address.x;
}

export function derivePublicKeyFromSecretKey(secretKey: Fq) {
  const curve = new Grumpkin();
  return curve.mul(curve.generator(), secretKey);
}

/**
 * Computes secret and public keys and public keys hash from a secret key.
 * @param secretKey - The secret key to derive keys from.
 * @returns The derived keys.
 */
export async function deriveKeys(secretKey: Fr) {
  // First we derive master secret keys -  we use sha512 here because this derivation will never take place
  // in a circuit
  const masterNullifierSecretKey =
    await deriveMasterNullifierSecretKey(secretKey);
  const masterIncomingViewingSecretKey =
    await deriveMasterIncomingViewingSecretKey(secretKey);
  const masterOutgoingViewingSecretKey =
    await deriveMasterOutgoingViewingSecretKey(secretKey);
  const masterTaggingSecretKey = await sha512ToGrumpkinScalar([
    secretKey,
    GeneratorIndex.TSK_M,
  ]);

  // Then we derive master public keys
  const masterNullifierPublicKey = await derivePublicKeyFromSecretKey(
    masterNullifierSecretKey
  );
  const masterIncomingViewingPublicKey = await derivePublicKeyFromSecretKey(
    masterIncomingViewingSecretKey
  );
  const masterOutgoingViewingPublicKey = await derivePublicKeyFromSecretKey(
    masterOutgoingViewingSecretKey
  );
  const masterTaggingPublicKey = await derivePublicKeyFromSecretKey(
    masterTaggingSecretKey
  );

  // We hash the public keys to get the public keys hash
  const publicKeys = new PublicKeys(
    masterNullifierPublicKey,
    masterIncomingViewingPublicKey,
    masterOutgoingViewingPublicKey,
    masterTaggingPublicKey
  );

  return {
    masterNullifierSecretKey,
    masterIncomingViewingSecretKey,
    masterOutgoingViewingSecretKey,
    masterTaggingSecretKey,
    publicKeys,
  };
}
