export interface TypedInfo {
  value: number;
  typeSize: number;
}

export function extractUnsignedSize(suffix: string): number {
  if (suffix[0] !== "U" && suffix[0] !== "u") return 0;
  let j = 1;
  let sizeStr = "";
  while (j < suffix.length) {
    const ch = suffix[j];
    if (ch && ch >= "0" && ch <= "9") {
      sizeStr += ch;
      j++;
    } else break;
  }
  return sizeStr.length > 0 ? Number(sizeStr) : 0;
}

export function validateUnsignedValue(n: number, size: number): void {
  const limits: Record<number, number> = {
    8: 255,
    16: 65535,
    32: 4294967295,
    64: Number.MAX_SAFE_INTEGER,
  };
  const limit = limits[size];
  if (limit !== undefined && n > limit)
    throw new RangeError(`value ${n} out of range for U${size}`);
}

export function extractTypeSize(typeStr: string): number {
  const t = typeStr.trim();
  if (t === "Bool") return 1;
  if (t.length < 1 || (t[0] !== "U" && t[0] !== "I")) return 0;
  let s = "";
  for (let i = 1; i < t.length; i++) {
    const ch = t[i];
    if (ch && ch >= "0" && ch <= "9") s += ch;
    else break;
  }
  return s.length > 0 ? Number(s) : 0;
}
