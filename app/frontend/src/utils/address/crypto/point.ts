import { Fr } from "./fields.js";
import { bufferToHex, hexToBuffer } from "@aztec/foundation/string";
import { poseidon2Hash } from "@zkpassport/poseidon2";
import { BufferReader, serializeToBuffer } from "../serialization.js";

/**
 * Represents a Point on an elliptic curve with x and y coordinates.
 * The Point class provides methods for creating instances from different input types,
 * converting instances to various output formats, and checking the equality of points.
 * TODO(#7386): Clean up this class.
 */
export class Point {
  static ZERO = new Point(Fr.ZERO, Fr.ZERO, false);
  static SIZE_IN_BYTES = Fr.SIZE_IN_BYTES * 2;
  static COMPRESSED_SIZE_IN_BYTES = Fr.SIZE_IN_BYTES;

  /** Used to differentiate this class from AztecAddress */
  public readonly kind = "point";

  constructor(
    /**
     * The point's x coordinate
     */
    public readonly x: Fr,
    /**
     * The point's y coordinate
     */
    public readonly y: Fr,
    /**
     * Whether the point is at infinity
     */
    public readonly isInfinite: boolean
  ) {
    // TODO(#7386): check if on curve
  }

  /**
   * Create a Point instance from a given buffer or BufferReader.
   * The input 'buffer' should have exactly 64 bytes representing the x and y coordinates.
   *
   * @param buffer - The buffer or BufferReader containing the x and y coordinates of the point.
   * @returns A Point instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new this(Fr.fromBuffer(reader), Fr.fromBuffer(reader), false);
  }

  /**
   * Create a Point instance from a hex-encoded string.
   * The input should be prefixed with '0x' or not, and have exactly 128 hex characters representing the x and y coordinates.
   * Throws an error if the input length is invalid or coordinate values are out of range.
   *
   * @param str - The hex-encoded string representing the Point coordinates.
   * @returns A Point instance.
   */
  static fromString(str: string) {
    return this.fromBuffer(hexToBuffer(str));
  }

  /**
   * Returns the contents of the point as an array of 2 fields.
   * @returns The point as an array of 2 fields
   */
  toFields() {
    return [this.x, this.y, new Fr(this.isInfinite)];
  }

  /**
   * Returns the x coordinate and the sign of the y coordinate.
   * @dev The y sign can be determined by checking if the y coordinate is greater than half of the modulus.
   * @returns The x coordinate and the sign of the y coordinate.
   */
  toXAndSign(): [Fr, boolean] {
    return [this.x, this.y.toBigInt() <= (Fr.MODULUS - 1n) / 2n];
  }

  /**
   * Returns the contents of the point as BigInts.
   * @returns The point as BigInts
   */
  toBigInts() {
    return {
      x: this.x.toBigInt(),
      y: this.y.toBigInt(),
      isInfinite: this.isInfinite ? 1n : 0n,
    };
  }

  /**
   * Converts the Point instance to a Buffer representation of the coordinates.
   * @returns A Buffer representation of the Point instance.
   * @dev Note that toBuffer does not include the isInfinite flag and other serialization methods do (e.g. toFields).
   * This is because currently when we work with point as bytes we don't want to populate the extra bytes for
   * isInfinite flag because:
   * 1. Our Grumpkin BB API currently does not handle point at infinity,
   * 2. we use toBuffer when serializing notes and events and there we only work with public keys and point at infinity
   *   is not considered a valid public key and the extra byte would raise DA cost.
   */
  toBuffer() {
    if (this.isInfinite) {
      throw new Error(
        "Cannot serialize infinite point without isInfinite flag"
      );
    }
    const buf = serializeToBuffer([this.x, this.y]);
    if (buf.length !== Point.SIZE_IN_BYTES) {
      throw new Error(`Invalid buffer length for Point: ${buf.length}`);
    }
    return buf;
  }

  /**
   * Converts the Point instance to a compressed Buffer representation of the coordinates.
   * @returns A Buffer representation of the Point instance
   */
  toCompressedBuffer() {
    const [x, sign] = this.toXAndSign();
    // Here we leverage that Fr fits into 254 bits (log2(Fr.MODULUS) < 254) and given that we serialize Fr to 32 bytes
    // and we use big-endian the 2 most significant bits are never populated. Hence we can use one of the bits as
    // a sign bit.
    const compressedValue = x.toBigInt() + (sign ? 2n ** 255n : 0n);
    const buf = serializeToBuffer(compressedValue);
    if (buf.length !== Point.COMPRESSED_SIZE_IN_BYTES) {
      throw new Error(
        `Invalid buffer length for compressed Point: ${buf.length}`
      );
    }
    return buf;
  }

  /**
   * Convert the Point instance to a hexadecimal string representation.
   * The output string is prefixed with '0x' and consists of exactly 128 hex characters,
   * representing the concatenated x and y coordinates of the point.
   *
   * @returns A hex-encoded string representing the Point instance.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Generate a short string representation of the Point instance.
   * The returned string includes the first 10 and last 4 characters of the full string representation,
   * with '...' in between to indicate truncation. This is useful for displaying or logging purposes
   * when the full string representation may be too long.
   *
   * @returns A truncated string representation of the Point instance.
   */
  toShortString() {
    const str = this.toString();
    return `${str.slice(0, 10)}...${str.slice(-4)}`;
  }

  /**
   * Check if two Point instances are equal by comparing their buffer values.
   * Returns true if the buffer values are the same, and false otherwise.
   *
   * @param rhs - The Point instance to compare with the current instance.
   * @returns A boolean indicating whether the two Point instances are equal.
   */
  equals(rhs: Point) {
    return this.x.equals(rhs.x) && this.y.equals(rhs.y);
  }

  isZero() {
    return this.x.isZero() && this.y.isZero();
  }

  hash() {
    return poseidon2Hash(this.toFields().map((field) => field.toBigInt()));
  }

  /**
   * Check if this is point at infinity.
   * Check this is consistent with how bb is encoding the point at infinity
   */
  public get inf() {
    return this.isInfinite;
  }

  isOnGrumpkin() {
    // TODO: Check this against how bb handles curve check and infinity point check
    if (this.inf) {
      return true;
    }

    // The Grumpkin equation is y^2 = x^3 - 17. We could use `YFromX` and then compare to `this.y`, but this would
    // involve computing the square root of y, of which there are two possible valid values. This method is also faster.
    const lhs = this.y.square();
    const rhs = this.x.mul(this.x).mul(this.x).sub(new Fr(17));
    return lhs.equals(rhs);
  }
}

export class NotOnCurveError extends Error {
  constructor(x: Fr) {
    super(
      "The given x-coordinate is not on the Grumpkin curve: " + x.toString()
    );
    this.name = "NotOnCurveError";
  }
}
