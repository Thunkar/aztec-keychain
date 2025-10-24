import type { AbiDecoded } from "@aztec/stdlib/abi";

export function formatAbiValue(value: AbiDecoded): string {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => formatAbiValue(v)).join(", ")}]`;
  }

  if (typeof value === "object") {
    // Check if it has a custom toString that's not the default Object.prototype.toString
    if ("toString" in value && value.toString !== Object.prototype.toString) {
      const stringValue = value.toString();
      // Make sure it's not the useless "[object Object]" string
      if (!stringValue.startsWith("[object ")) {
        return stringValue;
      }
    }

    // For plain objects or objects with useless toString, use JSON
    return JSON.stringify(value, (_, v) =>
      typeof v === "bigint" ? v.toString() : v
    );
  }

  return String(value);
}
