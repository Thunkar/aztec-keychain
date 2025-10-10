import type { FieldsOf } from "@aztec/aztec.js";
import { optional } from "@aztec/foundation/schemas";
import { serializeToBuffer, BufferReader } from "@aztec/foundation/serialize";

import { z } from "zod";

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export type WalletInteractionType =
  | "registerContract"
  | "createAccount"
  | "simulateTx"
  | "proveTx"
  | "sendTx"
  | "profileTx";

export const WalletInteractionSchema = z
  .object({
    id: z.string(),
    type: z.enum([
      "registerContract",
      "createAccount",
      "simulateTx",
      "proveTx",
      "sendTx",
      "profileTx",
    ]),
    status: z.string(),
    complete: z.boolean(),
    title: optional(z.string()),
    description: optional(z.string()),
  })
  .transform((data: any) => WalletInteraction.from(data));

export class WalletInteraction<T extends WalletInteractionType> {
  private constructor(
    public id: string,
    public type: T,
    public status: string,
    public complete: boolean,
    public title: string,
    public description: string
  ) {}

  update({
    status,
    complete,
    title,
    description,
  }: Partial<
    Omit<FieldsOf<WalletInteraction<WalletInteractionType>>, "id" | "type">
  >): WalletInteraction<WalletInteractionType> {
    this.status = status ?? this.status;
    this.complete = complete ?? this.complete;
    this.title = title ?? this.title;
    this.description = description ?? this.description;
    return this;
  }

  static from({
    id,
    type,
    status,
    complete,
    title,
    description,
  }: Optional<
    FieldsOf<WalletInteraction<WalletInteractionType>>,
    "id" | "title" | "description"
  >) {
    return new WalletInteraction(
      id ?? crypto.randomUUID(),
      type,
      status,
      complete,
      title ?? "",
      description ?? ""
    );
  }

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
