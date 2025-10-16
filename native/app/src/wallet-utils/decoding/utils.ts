import type { AztecAddress } from "@aztec/aztec.js";
import type { WalletDB } from "../wallet_db";
import type { PXE } from "@aztec/pxe/server";
import type { AbiDecoded } from "@aztec/stdlib/abi";

export async function getAddressAlias(
  pxe: PXE,
  db: WalletDB,
  address: AztecAddress
): Promise<string> {
  // Check if it's an account
  const accounts = await db.listAccounts();
  const account = accounts.find((acc) => acc.item.equals(address));
  if (account) {
    return account.alias;
  }

  // Check if it's a registered sender (contact)
  const senders = await db.listSenders();
  const sender = senders.find((s) => s.item.equals(address));
  if (sender) {
    return sender.alias.replace("senders:", "");
  }

  // Try to get contract metadata for more info
  try {
    const metadata = await pxe.getContractMetadata(address);
    const { artifact } = await pxe.getContractClassMetadata(
      metadata.contractInstance!.currentContractClassId,
      true
    );
    if (artifact) {
      return artifact.name;
    }
  } catch {
    // Ignore errors, use what we have
  }

  // Return shortened address if no alias found
  return `${address.toString().slice(0, 10)}...${address.toString().slice(-8)}`;
}

export function formatAbiValue(value: AbiDecoded): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "object" && "toString" in value) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => this.formatAbiValue(v)).join(", ")}]`;
  }

  if (typeof value === "object") {
    return JSON.stringify(value, (_, v) =>
      typeof v === "bigint" ? v.toString() : v
    );
  }

  return String(value);
}
