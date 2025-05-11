import { GeneratorIndex } from "@aztec/constants";
import { Fr } from "./crypto/fields";
import { poseidon2HashWithSeparator } from "./crypto/poseidon2";
import { FunctionSelector } from "./function_selector";
import { FunctionAbi } from "./abi/types";
import { encodeArguments } from "./abi/encoder";
import { computeAddress, deriveKeys } from "./derivation";

export function computeVarArgsHash(args: Fr[]): Promise<Fr> {
  if (args.length === 0) {
    return Promise.resolve(Fr.ZERO);
  }

  return poseidon2HashWithSeparator(args, GeneratorIndex.FUNCTION_ARGS);
}

export async function computeInitializationHashFromEncodedArgs(
  initFn: FunctionSelector,
  encodedArgs: Fr[]
): Promise<Fr> {
  const argsHash = await computeVarArgsHash(encodedArgs);
  return poseidon2HashWithSeparator(
    [initFn, argsHash],
    GeneratorIndex.CONSTRUCTOR
  );
}

export async function computeInitializationHash(
  initFn: FunctionAbi | undefined,
  args: any[]
): Promise<Fr> {
  if (!initFn) {
    return Fr.ZERO;
  }
  const selector = await FunctionSelector.fromNameAndParameters(
    initFn.name,
    initFn.parameters
  );
  const flatArgs = encodeArguments(initFn, args);
  return computeInitializationHashFromEncodedArgs(selector, flatArgs);
}

export function computeSaltedInitializationHash(
  initializationHash: Fr,
  salt: Fr,
  deployer: Fr
): Promise<Fr> {
  return poseidon2HashWithSeparator(
    [salt, initializationHash, deployer],
    GeneratorIndex.PARTIAL_ADDRESS
  );
}

export async function computePartialAddress(
  originalContractClassId: Fr,
  saltedInitializationHash: Fr
): Promise<Fr> {
  return poseidon2HashWithSeparator(
    [originalContractClassId, saltedInitializationHash],
    GeneratorIndex.PARTIAL_ADDRESS
  );
}

export async function computeAddressForAccount(
  originalContractClassId: number[],
  salt: number[],
  msk: number[],
  pk: number[],
  initFn: FunctionAbi | undefined
) {
  const { publicKeys } = await deriveKeys(new Fr(Buffer.from(msk)));
  const x = pk.slice(0, 32);
  const y = pk.slice(32, 64);
  console.log(x);
  console.log(y);
  const initializationHash = await computeInitializationHash(initFn, [x, y]);
  const saltedInitializationHash = await computeSaltedInitializationHash(
    initializationHash,
    Fr.fromBufferReduce(Buffer.from(salt)),
    Fr.ZERO
  );
  const partialAddress = await computePartialAddress(
    new Fr(Buffer.from(originalContractClassId)),
    saltedInitializationHash
  );
  const result = await computeAddress(publicKeys, partialAddress);
  return result.toString();
}
