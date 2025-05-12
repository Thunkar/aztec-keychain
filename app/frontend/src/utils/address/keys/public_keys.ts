import {
  DEFAULT_IVPK_M_X,
  DEFAULT_IVPK_M_Y,
  DEFAULT_NPK_M_X,
  DEFAULT_NPK_M_Y,
  DEFAULT_OVPK_M_X,
  DEFAULT_OVPK_M_Y,
  DEFAULT_TPK_M_X,
  DEFAULT_TPK_M_Y,
  GeneratorIndex,
} from "@aztec/constants";

import type { PublicKey } from "./public_key.js";
import { Fr } from "../crypto/fields.js";
import { poseidon2HashWithSeparator } from "../crypto/poseidon2.js";
import { Point } from "../crypto/point.js";
import { bufferToHex } from "@aztec/foundation/string";
import { serializeToBuffer } from "../serialization.js";

export class PublicKeys {
  public constructor(
    /** Master nullifier public key */
    public masterNullifierPublicKey: PublicKey,
    /** Master incoming viewing public key */
    public masterIncomingViewingPublicKey: PublicKey,
    /** Master outgoing viewing public key */
    public masterOutgoingViewingPublicKey: PublicKey,
    /** Master tagging viewing public key */
    public masterTaggingPublicKey: PublicKey
  ) {}

  hash() {
    return this.isEmpty()
      ? Fr.ZERO
      : poseidon2HashWithSeparator(
          [
            this.masterNullifierPublicKey,
            this.masterIncomingViewingPublicKey,
            this.masterOutgoingViewingPublicKey,
            this.masterTaggingPublicKey,
          ],
          GeneratorIndex.PUBLIC_KEYS_HASH
        );
  }

  isEmpty() {
    return (
      this.masterNullifierPublicKey.isZero() &&
      this.masterIncomingViewingPublicKey.isZero() &&
      this.masterOutgoingViewingPublicKey.isZero() &&
      this.masterTaggingPublicKey.isZero()
    );
  }

  static default(): PublicKeys {
    return new PublicKeys(
      new Point(new Fr(DEFAULT_NPK_M_X), new Fr(DEFAULT_NPK_M_Y), false),
      new Point(new Fr(DEFAULT_IVPK_M_X), new Fr(DEFAULT_IVPK_M_Y), false),
      new Point(new Fr(DEFAULT_OVPK_M_X), new Fr(DEFAULT_OVPK_M_Y), false),
      new Point(new Fr(DEFAULT_TPK_M_X), new Fr(DEFAULT_TPK_M_Y), false)
    );
  }

  /**
   * Determines if this PublicKeys instance is equal to the given PublicKeys instance.
   * Equality is based on the content of their respective buffers.
   *
   * @param other - The PublicKeys instance to compare against.
   * @returns True if the buffers of both instances are equal, false otherwise.
   */
  equals(other: PublicKeys): boolean {
    return (
      this.masterNullifierPublicKey.equals(other.masterNullifierPublicKey) &&
      this.masterIncomingViewingPublicKey.equals(
        other.masterIncomingViewingPublicKey
      ) &&
      this.masterOutgoingViewingPublicKey.equals(
        other.masterOutgoingViewingPublicKey
      ) &&
      this.masterTaggingPublicKey.equals(other.masterTaggingPublicKey)
    );
  }

  /**
   * Converts the PublicKeys instance into a Buffer.
   * This method should be used when encoding the address for storage, transmission or serialization purposes.
   *
   * @returns A Buffer representation of the PublicKeys instance.
   */
  toBuffer(): Buffer {
    return serializeToBuffer([
      this.masterNullifierPublicKey,
      this.masterIncomingViewingPublicKey,
      this.masterOutgoingViewingPublicKey,
      this.masterTaggingPublicKey,
    ]);
  }

  /**
   * Serializes the payload to an array of fields
   * @returns The fields of the payload
   */
  toFields(): Fr[] {
    return [
      ...this.masterNullifierPublicKey.toFields(),
      ...this.masterIncomingViewingPublicKey.toFields(),
      ...this.masterOutgoingViewingPublicKey.toFields(),
      ...this.masterTaggingPublicKey.toFields(),
    ];
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }
}
