/**
 * Minimal interpret implementation: parse a leading integer (optional sign).
 * Behavior required by tests:
 * - accept leading integer and ignore trailing text for non-negative numbers
 * - throw if a negative integer has trailing text
 */
export function interpret(input: string): number {
  const s = input.trim();
  if (s === "") return NaN;

  const additionResult = tryHandleAddition(s);
  if (additionResult !== undefined) return additionResult; 

  const { numStr, rest } = splitNumberAndSuffix(s);
  if (numStr === "") return NaN;

  const value = Number(numStr);
  if (!Number.isFinite(value)) return NaN;

  const suffix = parseWidthSuffix(rest);
  if (suffix !== undefined) {
    if (
      suffix.bits !== 8 &&
      suffix.bits !== 16 &&
      suffix.bits !== 32 &&
      suffix.bits !== 64
    ) {
      throw new Error("Invalid bit width");
    }

    if (suffix.bits <= 53 && suffix.bits !== 64) {
      validateWidthNumber(suffix.signed, suffix.bits, value);
    } else {
      validateWidthBig(suffix.signed, suffix.bits, numStr);
    }
  }

  if (rest !== "" && value < 0 && suffix === undefined) {
    throw new Error("Invalid trailing characters after negative number");
  }

  function validateWidthNumber(
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

  function validateWidthBig(
    signed: boolean,
    bits: number,
    numStr: string
  ): void {
    // bits === 64
    try {
      const big = BigInt(numStr);
      const base = BigInt(1) << BigInt(bits - 1);
      const bigMax = signed
        ? base - BigInt(1)
        : (base << BigInt(1)) - BigInt(1);
      const bigMin = signed ? -base : BigInt(0);
      if (big < bigMin || big > bigMax) {
        throw new Error("Integer out of range");
      }
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
  return value;
}

function tryHandleAddition(s: string): number | undefined {
  const plusParts = s
    .split("+")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (plusParts.length <= 1) return undefined;

  let common: WidthSuffix | undefined;
  for (const part of plusParts) {
    const { rest } = splitNumberAndSuffix(part);
    const suffix = parseWidthSuffix(rest);
    if (!suffix) {
      throw new Error("Missing or mixed width in addition");
    }
    if (!common) common = suffix;
    else if (suffix.bits !== common.bits || suffix.signed !== common.signed) {
      throw new Error("Mixed widths in addition");
    }
  }
  return plusParts.reduce((acc, part) => acc + interpret(part), 0);
}

interface NumberAndSuffix {
  numStr: string;
  rest: string;
}

interface WidthSuffix {
  signed: boolean;
  bits: number;
}

function splitNumberAndSuffix(s: string): NumberAndSuffix {
  let i = 0;
  const n = s.length;
  if (s[i] === "+" || s[i] === "-") i++;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) break;
    i++;
  }
  return { numStr: s.slice(0, i), rest: s.slice(i) };
}

function parseWidthSuffix(s: string): WidthSuffix | undefined {
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
  return { signed, bits };
}
