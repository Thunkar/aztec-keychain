import { Key } from "../components/dataContextContainer";

export function keyToHex(key: Key): string {
  return `0x${key.pk.map((i) => i.toString(16).padStart(2, "0")).join("")}`;
}

export function keyToShortStr(key: Key): string {
  const hex = keyToHex(key);
  return `${hex.slice(0, 6)}...${hex.slice(-4)}`;
}
