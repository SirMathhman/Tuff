import {
  extractUnsignedSize,
  validateUnsignedValue,
  type TypedInfo,
} from "./type-utils";

export type { TypedInfo };

export function scanNumericPrefix(s: string): number {
  const len = s.length;
  let i = 0;
  if (s[i] === "+" || s[i] === "-") i++;
  let hasDigits = false;
  while (i < len) {
    const ch = s[i];
    if (ch && ch >= "0" && ch <= "9") {
      hasDigits = true;
      i++;
    } else break;
  }
  if (i < len && s[i] === ".") {
    i++;
    while (i < len) {
      const ch = s[i];
      if (ch && ch >= "0" && ch <= "9") {
        hasDigits = true;
        i++;
      } else break;
    }
  }
  return hasDigits ? i : 0;
}

export function extractTypedInfo(s: string): TypedInfo {
  const b = s === "true" ? 1 : s === "false" ? 0 : NaN;
  if (Number.isFinite(b)) return { value: b, typeSize: 1 };
  const prefixEnd = scanNumericPrefix(s);
  if (prefixEnd === 0) {
    return {
      value: Number.isFinite(Number(s)) ? Number(s) : 0,
      typeSize: 0,
    };
  }
  const numStr = s.slice(0, prefixEnd);
  const n = Number(numStr);
  const typeSize = extractUnsignedSize(s.slice(prefixEnd));
  return { value: n, typeSize };
}

export function parseTypedNumber(s: string): number {
  const b = s === "true" ? 1 : s === "false" ? 0 : NaN;
  if (Number.isFinite(b)) return b;
  const prefixEnd = scanNumericPrefix(s);
  if (prefixEnd === 0) {
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`invalid expression: ${s}`);
    return n;
  }
  const n = Number(s.slice(0, prefixEnd)),
    suffix = s.slice(prefixEnd).trim(),
    typeSize = extractUnsignedSize(suffix);
  if (typeSize > 0 && n < 0) throw new Error("bad value");
  if (typeSize > 0) validateUnsignedValue(n, typeSize);
  if (!Number.isFinite(n)) throw new Error(`invalid expression: ${s}`);
  return n;
}
