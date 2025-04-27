import { Key } from "../components/DataContextContainer";

export function keyToHex(key: Key): string {
  return `0x${key.pk.map((i) => i.toString(16).padStart(2, "0")).join("")}`;
}

export function keyToShortStr(key: Key): string {
  const hex = keyToHex(key);
  return `0x${hex.slice(2, 6).toUpperCase()}...${hex.slice(-4).toUpperCase()}`;
}
