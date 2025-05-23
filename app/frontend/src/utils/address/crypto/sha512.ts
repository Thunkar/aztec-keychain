import { Bufferable, serializeToBuffer } from "../serialization";
import { GrumpkinScalar } from "./fields";
import { sha512 } from "hash.js";

/**
 * @dev We don't truncate in this function (unlike in sha256ToField) because this function is used in situations where
 * we don't care only about collision resistance but we need the output to be uniformly distributed as well. This is
 * because we use it as a pseudo-random function.
 */
export async function sha512ToGrumpkinScalar(data: Bufferable[]) {
  const buffer = serializeToBuffer(data);
  const hash = sha512().update(buffer).digest();
  return GrumpkinScalar.fromBufferReduce(Buffer.from(hash));
}
