import { poseidon2HashBytes } from "./crypto/poseidon2";
import { toBigIntBE } from "@aztec/foundation/bigint-buffer";
import { ABIParameter } from "./abi/types";
import { decodeFunctionSignature } from "./abi/decoder";
import { Fr } from "./crypto/fields";
import { BufferReader } from "./serialization";

/** A function selector is the first 4 bytes of the hash of a function signature. */
export class FunctionSelector {
  public static SIZE = 4;

  constructor(/** Value of the selector */ public value: number) {
    if (value > 2 ** (FunctionSelector.SIZE * 8) - 1) {
      throw new Error(
        `Selector must fit in ${FunctionSelector.SIZE} bytes (got value ${value}).`
      );
    }
  }

  /**
   * Returns a new field with the same contents as this EthAddress.
   *
   * @returns An Fr instance.
   */
  public toField() {
    return new Fr(BigInt(this.value));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const value = Number(toBigIntBE(reader.readBytes(FunctionSelector.SIZE)));
    return new FunctionSelector(value);
  }

  /**
   * Creates a selector from a signature.
   * @param signature - Signature to generate the selector for (e.g. "transfer(field,field)").
   * @returns selector.
   */
  static async fromSignature(signature: string) {
    // throw if signature contains whitespace
    if (/\s/.test(signature)) {
      throw new Error("Signature cannot contain whitespace");
    }
    const hash = await poseidon2HashBytes(Buffer.from(signature));
    // We take the last Selector.SIZE big endian bytes
    const bytes = hash.toBuffer().slice(-FunctionSelector.SIZE);
    return FunctionSelector.fromBuffer(bytes);
  }

  /**
   * Creates a function selector for a given function name and parameters.
   * @param name - The name of the function.
   * @param parameters - An array of ABIParameter objects, each containing the type information of a function parameter.
   * @returns A Buffer containing the 4-byte selector.
   */
  static fromNameAndParameters(args: {
    name: string;
    parameters: ABIParameter[];
  }): Promise<FunctionSelector>;
  static fromNameAndParameters(
    name: string,
    parameters: ABIParameter[]
  ): Promise<FunctionSelector>;
  static async fromNameAndParameters(
    nameOrArgs: string | { name: string; parameters: ABIParameter[] },
    maybeParameters?: ABIParameter[]
  ): Promise<FunctionSelector> {
    const { name, parameters } =
      typeof nameOrArgs === "string"
        ? { name: nameOrArgs, parameters: maybeParameters! }
        : nameOrArgs;
    const signature = decodeFunctionSignature(name, parameters);
    const selector = await this.fromSignature(signature);
    // If using the debug logger here it kill the typing in the `server_world_state_synchronizer` and jest tests.
    // console.log(`selector for ${signature} is ${selector}`);
    return selector;
  }
}
