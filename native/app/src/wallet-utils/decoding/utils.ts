import type { AbiDecoded } from "@aztec/stdlib/abi";

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
