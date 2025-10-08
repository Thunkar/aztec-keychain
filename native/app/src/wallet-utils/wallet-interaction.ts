import { serializeToBuffer, BufferReader } from "@aztec/foundation/serialize";

export type WalletInteractionType =
  | "registerContract"
  | "createAccount"
  | "simulateTx"
  | "proveTx"
  | "sendTx"
  | "profileTx";

export class WalletInteraction<T extends WalletInteractionType> {
  constructor(
    public id: string,
    public type: T,
    public status: string,
    public complete: boolean,
    public title: string,
    public description: string
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.id,
      this.type,
      this.status,
      this.complete,
      this.title,
      this.description
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const id = reader.readString();
    const type = reader.readString();

    return new WalletInteraction(
      id,
      type as WalletInteractionType,
      reader.readString(),
      !!reader.readBoolean(),
      reader.readString(),
      reader.readString()
    );
  }
}
