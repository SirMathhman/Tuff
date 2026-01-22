import { type Instruction, OpCode, Variant } from "./vm";
import { getTypeSuffix, findTypeSuffixIndex } from "./parser";

export interface Error {
  // What went wrong
  cause: string;

  // Why it went wrong
  reason: string;

  // How to fix it
  fix: string;
}

export interface Location {
  line: number;
  column: number;
  length: number;
}

export interface CompileError extends Error {
  first: Location;

  // Sometimes, we might have two different places that conflict with each other
  second?: Location;
}

export function isSignedType(suffix: string): boolean {
  return suffix.length > 0 && suffix[0] === "I";
}

export function getTypeBits(suffix: string): number | undefined {
  if (suffix.length < 2) return undefined;
  const bitsStr = suffix.substring(1);
  let isValidNumber = true;
  for (let i = 0; i < bitsStr.length; i++) {
    const char = bitsStr[i];
    if (!(char && char >= "0" && char <= "9")) {
      isValidNumber = false;
      break;
    }
  }
  if (isValidNumber) {
    const bits = parseInt(bitsStr, 10);
    if (!isNaN(bits)) {
      return bits;
    }
  }
  return undefined;
}

export function getTypeRange(
  suffix: string,
): { min: number; max: number } | undefined {
  const bits = getTypeBits(suffix);
  if (bits === undefined) return undefined;

  if (isSignedType(suffix)) {
    const minVal = -Math.pow(2, bits - 1);
    const maxVal = Math.pow(2, bits - 1) - 1;
    return { min: minVal, max: maxVal };
  }
  const minVal = 0;
  const maxVal = Math.pow(2, bits) - 1;
  return { min: minVal, max: maxVal };
}

export function hasTypeSuffix(source: string): boolean {
  return findTypeSuffixIndex(source) >= 0;
}

export function checkTypeOverflow(source: string): CompileError | undefined {
  if (!hasTypeSuffix(source)) return undefined;

  const suffix = getTypeSuffix(source);
  const range = getTypeRange(suffix);
  if (range === undefined) return undefined;

  const num = parseFloat(source.substring(0, findTypeSuffixIndex(source)));
  if (isNaN(num)) return undefined;

  if (num < range.min || num > range.max) {
    return {
      cause: `Value ${num} overflows type ${suffix}`,
      reason: `${suffix} can only hold values between ${range.min} and ${range.max}`,
      fix: `Use a larger type suffix or remove the suffix`,
      first: { line: 0, column: 0, length: source.length },
    };
  }

  return undefined;
}

export function checkNegativeUnsignedError(
  source: string,
): CompileError | undefined {
  if (source.startsWith("-") && hasTypeSuffix(source)) {
    const suffix = getTypeSuffix(source);
    if (!isSignedType(suffix)) {
      return {
        cause: "Negative literals cannot have unsigned type suffixes",
        reason:
          "Type suffixes like U8 are for unsigned types, which cannot be negative",
        fix: "Use a signed type suffix like I8, or remove the type suffix",
        first: { line: 0, column: 0, length: source.length },
      };
    }
  }
  return undefined;
}

export function buildMulOrDivHalt(
  opcode: OpCode,
  resultMemory: number,
): Instruction[] {
  return [
    {
      opcode,
      variant: Variant.Direct,
      operand1: resultMemory,
    },
  ];
}
