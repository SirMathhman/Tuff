import { isPlusMinus } from "./shared";

export interface NumberAndSuffix {
  numStr: string;
  rest: string;
}

export interface WidthSuffix {
  signed: boolean;
  bits: number;
}

export function splitNumberAndSuffix(s: string): NumberAndSuffix {
  let i = 0;
  const n = s.length;
  if (isPlusMinus(s[i])) i++;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) break;
    i++;
  }
  return { numStr: s.slice(0, i), rest: s.slice(i) } as NumberAndSuffix;
}

export function parseWidthSuffix(s: string): WidthSuffix | undefined {
  if (s.length < 2) return undefined;
  const first = s[0];
  const signed = first === "I" || first === "i";
  if (!signed && first !== "U" && first !== "u") return undefined;
  const digits = s.slice(1);
  if (digits.length === 0) return undefined;
  for (let i = 0; i < digits.length; i++) {
    const c = digits.charCodeAt(i);
    if (c < 48 || c > 57) return undefined;
  }
  const bits = Number(digits);
  if (!Number.isInteger(bits)) return undefined;
  return { signed, bits } as WidthSuffix;
}

export function validateWidthNumber(
  signed: boolean,
  bits: number,
  value: number
): void {
  const max = signed ? 2 ** (bits - 1) - 1 : 2 ** bits - 1;
  const min = signed ? -(2 ** (bits - 1)) : 0;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error("Integer out of range");
  }
}

export function validateWidthBig(
  signed: boolean,
  bits: number,
  numStr: string
): void {
  // bits === 64
  try {
    const big = BigInt(numStr);
    const base = BigInt(1) << BigInt(bits - 1);
    const bigMax = signed ? base - BigInt(1) : (base << BigInt(1)) - BigInt(1);
    const bigMin = signed ? -base : BigInt(0);
    if (big < bigMin || big > bigMax) throw new Error("Integer out of range");
    if (
      big > BigInt(Number.MAX_SAFE_INTEGER) ||
      big < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new Error("Value out of safe integer range");
    }
  } catch (e) {
    if (e instanceof Error && e.message === "Integer out of range") throw e;
    throw new Error("Invalid integer for specified width");
  }
}

export function widthUsesNumber(bits: number): boolean {
  return bits <= 53 && bits !== 64;
}

export function validateNumberSuffix(
  rest: string,
  value: number,
  numStr: string
): boolean {
  const suffix = parseWidthSuffix(rest);
  if (!suffix) return false;
  if (
    suffix.bits !== 8 &&
    suffix.bits !== 16 &&
    suffix.bits !== 32 &&
    suffix.bits !== 64
  ) {
    throw new Error("Invalid bit width");
  }

  if (widthUsesNumber(suffix.bits)) {
    validateWidthNumber(suffix.signed, suffix.bits, value);
  } else {
    validateWidthBig(suffix.signed, suffix.bits, numStr);
  }
  return true;
}
