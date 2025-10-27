import type { FieldsOf } from "@aztec/foundation/types";
import { optional } from "@aztec/foundation/schemas";
import { serializeToBuffer, BufferReader } from "@aztec/foundation/serialize";
import { jsonStringify } from "@aztec/foundation/json-rpc";

import { z } from "zod";

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export type WalletInteractionType =
  | "registerSender"
  | "registerContract"
  | "createAccount"
  | "simulateTx"
  | "simulateUtility"
  | "sendTx"
  | "profileTx";

export const WalletInteractionSchema = z
  .object({
    id: z.string(),
    type: z.enum([
      "registerSender",
      "registerContract",
      "createAccount",
      "simulateTx",
      "simulateUtility",
      "sendTx",
      "profileTx",
    ]),
    status: z.string(),
    complete: z.boolean(),
    title: optional(z.string()),
    description: optional(z.string()),
    timestamp: z.number(),
  })
  .transform((data: any) => WalletInteraction.from(data));

export class WalletInteraction<T extends WalletInteractionType> {
  private constructor(
    public id: string,
    public type: T,
    public status: string,
    public complete: boolean,
    public title: string,
    public description: string,
    public timestamp: number
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
    timestamp,
  }: Optional<
    FieldsOf<WalletInteraction<WalletInteractionType>>,
    "id" | "title" | "description" | "timestamp"
  >) {
    return new WalletInteraction(
      id ?? crypto.randomUUID(),
      type,
      status,
      complete,
      title ?? "",
      description ?? "",
      timestamp ?? Date.now()
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.id,
      this.type,
      this.status,
      this.complete,
      this.title,
      this.description,
      BigInt(this.timestamp)
    );
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const id = reader.readString();
    const type = reader.readString();
    const status = reader.readString();
    const complete = !!reader.readBoolean();
    const title = reader.readString();
    const description = reader.readString();

    // Handle backwards compatibility: old interactions won't have timestamp
    let timestamp: number;
    try {
      timestamp = Number(reader.readBigInt());
    } catch {
      timestamp = Date.now();
    }

    return new WalletInteraction(
      id,
      type as WalletInteractionType,
      status,
      complete,
      title,
      description,
      timestamp
    );
  }
}

export class WalletUpdateEvent extends CustomEvent<string> {
  constructor(content: WalletInteraction<any>) {
    super("wallet-update", { detail: jsonStringify(content) });
  }
}
