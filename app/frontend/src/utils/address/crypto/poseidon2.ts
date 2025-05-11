import { poseidon2Hash } from "@zkpassport/poseidon2";
import { Fieldable, serializeToFields } from "../serialization";
import { Fr } from "./fields";

export async function poseidon2HashWithSeparator(
  input: Fieldable[],
  separator: number
): Promise<Fr> {
  const inputFields = serializeToFields(input);
  inputFields.unshift(new Fr(separator));
  const hash = await poseidon2Hash(inputFields.map((f) => f.toBigInt()));
  return new Fr(hash);
}

export async function poseidon2HashBytes(input: Buffer): Promise<Fr> {
  const inputFields = [];
  for (let i = 0; i < input.length; i += 31) {
    const fieldBytes = Buffer.alloc(32, 0);
    input.slice(i, i + 31).copy(fieldBytes);

    // Noir builds the bytes as little-endian, so we need to reverse them.
    fieldBytes.reverse();
    inputFields.push(Fr.fromBuffer(fieldBytes));
  }

  const hash = await poseidon2Hash(inputFields.map((f) => f.toBigInt()));
  return new Fr(hash);
}
