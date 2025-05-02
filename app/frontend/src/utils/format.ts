export function keyToHex(key: number[]): string {
  return `0x${key.map((i) => i.toString(16).padStart(2, "0")).join("")}`;
}

export function keyToShortStr(key: number[]): string {
  const hex = keyToHex(key);
  return `0x${hex.slice(2, 6).toUpperCase()}...${hex.slice(-4).toUpperCase()}`;
}
