import { toBufferBE } from "@aztec/foundation/bigint-buffer";
import { Fr } from "./crypto/fields";

type _Tuple<T, N extends number, R extends unknown[]> = R["length"] extends N
  ? R
  : _Tuple<T, N, [T, ...R]>;

export type Tuple<T, N extends number> = N extends N
  ? number extends N
    ? T[]
    : _Tuple<T, N, []>
  : never;

/** A type that can be converted to a Field or a Field array. */
export type Fieldable =
  | Fr
  | boolean
  | number
  | bigint
  | Buffer
  | {
      /**
       * Serialize to a field.
       * @dev Duplicate to `toField` but left as is as it is used in AVM codebase.
       */
      toFr: () => Fr;
    }
  | {
      /** Serialize to a field. */
      toField: () => Fr;
    }
  | {
      /** Serialize to an array of fields. */
      toFields: () => Fr[];
    }
  | Fieldable[];

/** A type that can be written to a buffer. */
export type Bufferable =
  | boolean
  | Buffer
  | Uint8Array
  | number
  | bigint
  | string
  | {
      /**
       * Serialize to a buffer.
       */
      toBuffer: () => Buffer;
    }
  | Bufferable[];

/**
 * Serializes a list of objects contiguously.
 * @param objs - Objects to serialize.
 * @returns An array of fields with the concatenation of all fields.
 */
export function serializeToFields(...objs: Fieldable[]): Fr[] {
  const ret: Fr[] = [];
  for (const obj of objs) {
    if (Array.isArray(obj)) {
      ret.push(...serializeToFields(...obj));
    } else if (obj instanceof Fr) {
      ret.push(obj);
    } else if (
      typeof obj === "boolean" ||
      typeof obj === "number" ||
      typeof obj === "bigint"
    ) {
      ret.push(new Fr(obj));
    } else if ("toFields" in obj) {
      ret.push(...obj.toFields());
    } else if ("toFr" in obj) {
      ret.push(obj.toFr());
    } else if ("toField" in obj) {
      ret.push(obj.toField());
    } else if (Buffer.isBuffer(obj)) {
      ret.push(Fr.fromBuffer(obj));
    } else {
      throw new Error(
        `Cannot serialize input to field: ${typeof obj} ${(obj as any).constructor?.name}`
      );
    }
  }
  return ret;
}

export class BufferReader {
  private index: number;
  constructor(
    private buffer: Buffer,
    offset = 0
  ) {
    this.index = offset;
  }

  /**
   * Creates a BufferReader instance from either a Buffer or an existing BufferReader.
   * If the input is a Buffer, it creates a new BufferReader with the given buffer.
   * If the input is already a BufferReader, it returns the input unchanged.
   *
   * @param bufferOrReader - A Buffer or BufferReader to initialize the BufferReader.
   * @returns An instance of BufferReader.
   */
  public static asReader(
    bufferOrReader: Uint8Array | Buffer | BufferReader
  ): BufferReader {
    if (bufferOrReader instanceof BufferReader) {
      return bufferOrReader;
    }

    const buf = Buffer.isBuffer(bufferOrReader)
      ? bufferOrReader
      : Buffer.from(
          bufferOrReader.buffer,
          bufferOrReader.byteOffset,
          bufferOrReader.byteLength
        );

    return new BufferReader(buf);
  }

  /** Returns true if the underlying buffer has been consumed completely. */
  public isEmpty(): boolean {
    return this.index === this.buffer.length;
  }

  /**
   * Reads a 32-bit unsigned integer from the buffer at the current index position.
   * Updates the index position by 4 bytes after reading the number.
   *
   * @returns The read 32-bit unsigned integer value.
   */
  public readNumber(): number {
    this.#rangeCheck(4);
    this.index += 4;
    return this.buffer.readUint32BE(this.index - 4);
  }

  /**
   * Reads `count` 32-bit unsigned integers from the buffer at the current index position.
   * @param count - The number of 32-bit unsigned integers to read.
   * @returns An array of 32-bit unsigned integers.
   */
  public readNumbers<N extends number>(count: N): Tuple<number, N> {
    const result = Array.from({ length: count }, () => this.readNumber());
    return result as Tuple<number, N>;
  }

  /**
   * Reads a 256-bit unsigned integer from the buffer at the current index position.
   * Updates the index position by 32 bytes after reading the number.
   *
   * Assumes the number is stored in big-endian format.
   *
   * @returns The read 256 bit value as a bigint.
   */
  public readUInt256(): bigint {
    this.#rangeCheck(32);

    let result = BigInt(0);
    for (let i = 0; i < 32; i++) {
      result = (result << BigInt(8)) | BigInt(this.buffer[this.index + i]);
    }

    this.index += 32;
    return result;
  }

  /**
   * Reads a 16-bit unsigned integer from the buffer at the current index position.
   * Updates the index position by 2 bytes after reading the number.
   *
   * @returns The read 16 bit value.
   */
  public readUInt16(): number {
    this.#rangeCheck(2);
    this.index += 2;
    return this.buffer.readUInt16BE(this.index - 2);
  }

  /**
   * Reads a 8-bit unsigned integer from the buffer at the current index position.
   * Updates the index position by 1 byte after reading the number.
   *
   * @returns The read 8 bit value.
   */
  public readUInt8(): number {
    this.#rangeCheck(1);
    this.index += 1;
    return this.buffer.readUInt8(this.index - 1);
  }

  /**
   * Reads and returns the next boolean value from the buffer.
   * Advances the internal index by 1, treating the byte at the current index as a boolean value.
   * Returns true if the byte is non-zero, false otherwise.
   *
   * @returns A boolean value representing the byte at the current index.
   */
  public readBoolean(): boolean {
    this.#rangeCheck(1);
    this.index += 1;
    return Boolean(this.buffer.at(this.index - 1));
  }

  /**
   * Reads a specified number of bytes from the buffer and returns a new Buffer containing those bytes.
   * Advances the reader's index by the number of bytes read. Throws an error if there are not enough
   * bytes left in the buffer to satisfy the requested number of bytes.
   *
   * @param n - The number of bytes to read from the buffer.
   * @returns A new Buffer containing the read bytes.
   */
  public readBytes(n: number): Buffer {
    this.#rangeCheck(n);
    this.index += n;
    return Buffer.from(this.buffer.subarray(this.index - n, this.index));
  }

  /** Reads until the end of the buffer. */
  public readToEnd(): Buffer {
    const result = this.buffer.subarray(this.index);
    this.index = this.buffer.length;
    return result;
  }

  /**
   * Reads a vector of numbers from the buffer and returns it as an array of numbers.
   * The method utilizes the 'readVector' method, passing a deserializer that reads numbers.
   *
   * @returns An array of numbers representing the vector read from the buffer.
   */
  public readNumberVector(): number[] {
    return this.readVector({
      fromBuffer: (reader: BufferReader) => reader.readNumber(),
    });
  }

  /**
   * Reads a vector of fixed size from the buffer and deserializes its elements using the provided itemDeserializer object.
   * The 'itemDeserializer' object should have a 'fromBuffer' method that takes a BufferReader instance and returns the deserialized element.
   * The method first reads the size of the vector (a number) from the buffer, then iterates through its elements,
   * deserializing each one using the 'fromBuffer' method of 'itemDeserializer'.
   *
   * @param itemDeserializer - Object with 'fromBuffer' method to deserialize vector elements.
   * @returns An array of deserialized elements of type T.
   */
  public readVector<T>(itemDeserializer: {
    /**
     * A method to deserialize data from a buffer.
     */
    fromBuffer: (reader: BufferReader) => T;
  }): T[] {
    const size = this.readNumber();
    const result = new Array<T>(size);
    for (let i = 0; i < size; i++) {
      result[i] = itemDeserializer.fromBuffer(this);
    }
    return result;
  }

  /**
   * Reads a vector of fixed size from the buffer and deserializes its elements using the provided itemDeserializer object.
   * The 'itemDeserializer' object should have a 'fromBuffer' method that takes a BufferReader instance and returns the deserialized element.
   * The method first reads the size of the vector (a number) from the buffer, then iterates through its elements,
   * deserializing each one using the 'fromBuffer' method of 'itemDeserializer'.
   *
   * @param itemDeserializer - Object with 'fromBuffer' method to deserialize vector elements.
   * @returns An array of deserialized elements of type T.
   */
  public readVectorUint8Prefix<T>(itemDeserializer: {
    /**
     * A method to deserialize data from a buffer.
     */
    fromBuffer: (reader: BufferReader) => T;
  }): T[] {
    const size = this.readUInt8();
    const result = new Array<T>(size);
    for (let i = 0; i < size; i++) {
      result[i] = itemDeserializer.fromBuffer(this);
    }
    return result;
  }

  /**
   * Read an array of a fixed size with elements of type T from the buffer.
   * The 'itemDeserializer' object should have a 'fromBuffer' method that takes a BufferReader instance as input,
   * and returns an instance of the desired deserialized data type T.
   * This method will call the 'fromBuffer' method for each element in the array and return the resulting array.
   *
   * @param size - The fixed number of elements in the array.
   * @param itemDeserializer - An object with a 'fromBuffer' method to deserialize individual elements of type T.
   * @returns An array of instances of type T.
   */
  public readArray<T, N extends number>(
    size: N,
    itemDeserializer: {
      /**
       * A function for deserializing data from a BufferReader instance.
       */
      fromBuffer: (reader: BufferReader) => T;
    }
  ): Tuple<T, N> {
    const result = Array.from({ length: size }, () =>
      itemDeserializer.fromBuffer(this)
    );
    return result as Tuple<T, N>;
  }

  /**
   * Read a variable sized Buffer array where elements are represented by length + data.
   * The method consecutively looks for a number which is the size of the proceeding buffer,
   * then reads the bytes until it reaches the end of the reader's internal buffer.
   * NOTE: if `size` is not provided, this will run to the end of the reader's buffer.
   * @param size - Size of the buffer array in bytes (full remaining buffer length if left empty).
   * @returns An array of variable sized buffers.
   */
  public readBufferArray(size = -1): Buffer[] {
    const result: Buffer[] = [];
    const end = size >= 0 ? this.index + size : this.buffer.length;
    this.#rangeCheck(end - this.index);
    while (this.index < end) {
      const item = this.readBuffer();
      result.push(item);
    }
    // Ensure that all bytes have been read.
    if (this.index !== end) {
      throw new Error(
        `Reader buffer was not fully consumed. Consumed up to ${this.index} bytes. End of data: ${end} bytes.`
      );
    }
    return result;
  }

  /**
   * Reads a serialized object from a buffer and returns the deserialized object using the given deserializer.
   *
   * @typeparam T - The type of the deserialized object.
   * @param deserializer - An object with a 'fromBuffer' method that takes a BufferReader instance and returns an instance of the deserialized object.
   * @returns The deserialized object of type T.
   */
  public readObject<T>(deserializer: {
    /**
     * A method that takes a BufferReader instance and returns an instance of the deserialized data type.
     */
    fromBuffer: (reader: BufferReader) => T;
  }): T {
    return deserializer.fromBuffer(this);
  }

  /**
   * Returns a Buffer containing the next n bytes from the current buffer without modifying the reader's index position.
   * If n is not provided or exceeds the remaining length of the buffer, it returns all bytes from the current position till the end of the buffer.
   *
   * @param n - The number of bytes to peek from the current buffer. (Optional).
   * @returns A Buffer with the next n bytes or the remaining bytes if n is not provided or exceeds the buffer length.
   */
  public peekBytes(n?: number): Buffer {
    this.#rangeCheck(n || 0);
    return this.buffer.subarray(this.index, n ? this.index + n : undefined);
  }

  /**
   * Reads a string from the buffer and returns it.
   * The method first reads the size of the string, then reads the corresponding
   * number of bytes from the buffer and converts them to a string.
   *
   * @returns The read string from the buffer.
   */
  public readString(): string {
    return this.readBuffer().toString();
  }

  /**
   * Reads a buffer from the current position of the reader and advances the index.
   * The method first reads the size (number) of bytes to be read, and then returns
   * a Buffer with that size containing the bytes. Useful for reading variable-length
   * binary data encoded as (size, data) format.
   *
   * @returns A Buffer containing the read bytes.
   */
  public readBuffer(): Buffer {
    const size = this.readNumber();
    this.#rangeCheck(size);
    return this.readBytes(size);
  }

  /**
   * Reads a buffer from the current position of the reader and advances the index.
   * The method first reads the size (number) of bytes to be read, and then returns
   * a Buffer with that size containing the bytes. Useful for reading variable-length
   * binary data encoded as (size, data) format.
   *
   * @returns A Buffer containing the read bytes.
   */
  public readUint8Array(): Uint8Array {
    const size = this.readNumber();
    this.#rangeCheck(size);
    return this.readBytes(size);
  }

  /**
   * Reads and constructs a map object from the current buffer using the provided deserializer.
   * The method reads the number of entries in the map, followed by iterating through each key-value pair.
   * The key is read as a string, while the value is obtained using the passed deserializer's `fromBuffer` method.
   * The resulting map object is returned, containing all the key-value pairs read from the buffer.
   *
   * @param deserializer - An object with a `fromBuffer` method to deserialize the values in the map.
   * @returns A map object with string keys and deserialized values based on the provided deserializer.
   */
  public readMap<T>(deserializer: {
    /**
     * Deserializes an element of type T from a BufferReader instance.
     */
    fromBuffer: (reader: BufferReader) => T;
  }): { [key: string]: T } {
    const numEntries = this.readNumber();
    const map: { [key: string]: T } = {};
    for (let i = 0; i < numEntries; i++) {
      const key = this.readString();
      const value = this.readObject<T>(deserializer);
      map[key] = value;
    }
    return map;
  }

  /**
   * Get the length of the reader's buffer.
   * @returns The length of the underlying reader's buffer.
   */
  public getLength(): number {
    return this.buffer.length;
  }

  /**
   * Gets bytes remaining to be read from the buffer.
   * @returns Bytes remaining to be read from the buffer.
   */
  public remainingBytes(): number {
    return this.buffer.length - this.index;
  }

  #rangeCheck(numBytes: number) {
    if (this.index + numBytes > this.buffer.length) {
      throw new Error(
        `Attempted to read beyond buffer length. Start index: ${this.index}, Num bytes to read: ${numBytes}, Buffer length: ${this.buffer.length}`
      );
    }
  }
}

/**
 * A deserializer
 */
export interface FromBuffer<T> {
  /**
   * Deserializes an object from a buffer
   * @param buffer - The buffer to deserialize.
   */
  fromBuffer(buffer: Buffer): T;
}

/**
 * Serialize a BigInt value into a Buffer of specified width.
 * The function converts the input BigInt into its big-endian representation and stores it in a Buffer of the given width.
 * If the width is not provided, a default value of 32 bytes will be used. It is important to provide an appropriate width
 * to avoid truncation or incorrect serialization of large BigInt values.
 *
 * @param n - The BigInt value to be serialized.
 * @param width - The width (in bytes) of the output Buffer, optional with default value 32.
 * @returns A Buffer containing the serialized BigInt value in big-endian format.
 */
export function serializeBigInt(n: bigint, width = 32) {
  return toBufferBE(n, width);
}

export function numToUInt32BE(n: number, bufferSize = 4) {
  const buf = Buffer.alloc(bufferSize);
  buf.writeUInt32BE(n, bufferSize - 4);
  return buf;
}

export function boolToBuffer(value: boolean, bufferSize = 1): Buffer {
  const buf = Buffer.alloc(bufferSize);
  buf.writeUInt8(value ? 1 : 0, bufferSize - 1);
  return buf;
}

export function serializeToBufferArray(...objs: Bufferable[]): Buffer[] {
  const ret: Buffer[] = [];
  for (const obj of objs) {
    if (Array.isArray(obj)) {
      ret.push(...serializeToBufferArray(...obj));
    } else if (Buffer.isBuffer(obj)) {
      ret.push(obj);
    } else if (typeof obj === "boolean") {
      ret.push(boolToBuffer(obj));
    } else if (typeof obj === "bigint") {
      // Throw if bigint does not fit into 32 bytes
      if (
        obj >
        BigInt(
          "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        )
      ) {
        throw new Error(`BigInt ${obj} does not fit into 32 bytes`);
      }
      ret.push(serializeBigInt(obj));
    } else if (typeof obj === "number") {
      // Note: barretenberg assumes everything is big-endian
      ret.push(numToUInt32BE(obj)); // TODO: Are we always passing numbers as UInt32?
    } else if (typeof obj === "string") {
      ret.push(numToUInt32BE(obj.length));
      ret.push(Buffer.from(obj));
    } else if ("toBuffer" in obj) {
      ret.push(obj.toBuffer());
    } else {
      throw new Error(
        `Cannot serialize input to buffer: ${typeof obj} ${(obj as any).constructor?.name}`
      );
    }
  }
  return ret;
}

export function serializeToBuffer(...objs: Bufferable[]): Buffer {
  return Buffer.concat(serializeToBufferArray(...objs));
}
