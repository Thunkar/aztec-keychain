import nodeCrypto from "crypto";
import isNode from "detect-node";

/**
 * A number generator which is used as a source of randomness in the system. If the SEED env variable is set, the
 * generator will be deterministic and will always produce the same sequence of numbers. Otherwise a true randomness
 * sourced by crypto library will be used.
 * @remarks This class was implemented so that tests can be run deterministically.
 *
 * TODO(#3949): This is not safe enough for production and should be made safer or removed before mainnet.
 */
export class RandomnessSingleton {
  private static instance: RandomnessSingleton;

  private counter = 0;

  private constructor(private readonly seed?: number) {
    if (seed !== undefined) {
      this.counter = seed;
    }
  }

  public static getInstance(): RandomnessSingleton {
    if (!RandomnessSingleton.instance) {
      const seed = process.env.SEED ? Number(process.env.SEED) : undefined;
      RandomnessSingleton.instance = new RandomnessSingleton(seed);
    }

    return RandomnessSingleton.instance;
  }

  /**
   * Indicates whether the generator is deterministic (was seeded) or not.
   * @returns Whether the generator is deterministic.
   */
  public isDeterministic(): boolean {
    return this.seed !== undefined;
  }

  public getBytes(length: number): Buffer {
    if (this.seed === undefined) {
      // Note: It would be more natural to just have the contents of randomBytes(...) function from
      // yarn-project/foundation/src/crypto/random/index.ts here but that would result in a larger
      // refactor so I think prohibiting use of this func when the seed is undefined is and handling
      // the singleton within randomBytes func is fine.
      throw new Error(
        "RandomnessSingleton is not implemented for non-deterministic mode"
      );
    }
    const result = Buffer.alloc(length);
    for (let i = 0; i < length; i++) {
      // Each byte of the buffer is set to a 1 byte of this.counter's value. 0xff is 255 in decimal and it's used as
      // a mask to get the last 8 bits of the shifted counter.
      result[i] = (this.counter >> (i * 8)) & 0xff;
    }
    this.counter++;
    return result;
  }
}

// limit of Crypto.getRandomValues()
// https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues
const MAX_BYTES = 65536;

const getWebCrypto = () => {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto;
  }
  if (typeof self !== "undefined" && self.crypto) {
    return self.crypto;
  }
  return undefined;
};

export const randomBytes = (len: number) => {
  const singleton = RandomnessSingleton.getInstance();

  if (singleton.isDeterministic()) {
    return singleton.getBytes(len);
  }

  if (isNode) {
    return nodeCrypto.randomBytes(len) as Buffer;
  }

  const crypto = getWebCrypto();
  if (!crypto) {
    throw new Error("randomBytes UnsupportedEnvironment");
  }

  const buf = Buffer.allocUnsafe(len);
  if (len > MAX_BYTES) {
    // this is the max bytes crypto.getRandomValues
    // can do at once see https://developer.mozilla.org/en-US/docs/Web/API/window.crypto.getRandomValues
    for (let generated = 0; generated < len; generated += MAX_BYTES) {
      // buffer.slice automatically checks if the end is past the end of
      // the buffer so we don't have to here
      crypto.getRandomValues(buf.slice(generated, generated + MAX_BYTES));
    }
  } else {
    crypto.getRandomValues(buf);
  }

  return buf;
};

/**
 * Generate a random integer less than max.
 * @param max - The maximum value.
 * @returns A random integer.
 *
 * TODO(#3949): This is insecure as it's modulo biased. Nuke or safeguard before mainnet.
 */
export const randomInt = (max: number) => {
  const randomBuffer = randomBytes(6); // Generate a buffer of 6 random bytes.
  const randomInt = parseInt(randomBuffer.toString("hex"), 16); // Convert buffer to a large integer.
  return randomInt % max; // Use modulo to ensure the result is less than max.
};

/**
 * Generate a random bigint less than max.
 * @param max - The maximum value.
 * @returns A random bigint.
 *
 * TODO(#3949): This is insecure as it's modulo biased. Nuke or safeguard before mainnet.
 */
export const randomBigInt = (max: bigint) => {
  const randomBuffer = randomBytes(8); // Generate a buffer of 8 random bytes.
  const randomBigInt = BigInt(`0x${randomBuffer.toString("hex")}`); // Convert buffer to a large integer.
  return randomBigInt % max; // Use modulo to ensure the result is less than max.
};

/**
 * Generate a random boolean value.
 * @returns A random boolean value.
 */
export const randomBoolean = () => {
  const randomByte = randomBytes(1)[0]; // Generate a single random byte.
  return randomByte % 2 === 0; // Use modulo to determine if the byte is even or odd.
};
