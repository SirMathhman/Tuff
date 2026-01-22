import { type Instruction, OpCode, Variant } from "../core/vm";
import { getTypeSuffix, findTypeSuffixIndex } from "../parsing/parser";
import { parseArrayTypeComponents } from "../types/array-helpers";
import { buildStoreAndHalt } from "../compilation/instruction-primitives";

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
  // Handle Bool as a special case
  if (suffix === "Bool") {
    return { min: 0, max: 1 };
  }

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
  if (source.endsWith("Bool")) return true;
  return findTypeSuffixIndex(source) >= 0;
}

export function checkTypeOverflow(source: string): CompileError | undefined {
  if (!hasTypeSuffix(source)) return undefined;

  const suffix = getTypeSuffix(source);

  // Bool doesn't have numeric literals (only read Bool), so skip overflow check
  if (suffix === "Bool") return undefined;

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

export function isTypeCompatible(
  declaredType: string,
  exprType: string,
): boolean {
  if (declaredType === exprType) return true;

  // Bool type only matches Bool
  if (declaredType === "Bool" || exprType === "Bool") return false;

  // Handle array types
  if (isArrayType(declaredType) || isArrayType(exprType)) {
    // Arrays must match exactly
    return declaredType === exprType;
  }

  // Handle slice types - can accept array types when creating slices
  if (isSliceType(declaredType) && isArrayType(exprType)) {
    // Slice type accepting array type: check element types match
    const sliceElem = getSliceElementType(declaredType);
    const arrayElem = getArrayElementType(exprType);
    return sliceElem === arrayElem;
  }

  if (isSliceType(declaredType)) {
    // If expr is a slice type, must match exactly
    return declaredType === exprType;
  }

  // Handle pointer types
  if (declaredType.startsWith("*") || exprType.startsWith("*")) {
    // Pointers must match exactly or both be pointer types to same base
    return declaredType === exprType;
  }

  const declaredBits = getTypeBits(declaredType);
  const exprBits = getTypeBits(exprType);

  if (declaredBits === undefined || exprBits === undefined) return false;

  const declaredSigned = isSignedType(declaredType);
  const exprSigned = isSignedType(exprType);

  // Allow narrowing: expr type can fit in declared type
  // For unsigned: U8 (8 bits) -> U16 (16 bits), U8 -> I16 (16 bits, signed)
  // For signed: I8 (8 bits) -> I16 (16 bits)
  // For mixed: U8 (8 bits) -> I16 (16 bits - room for sign and value)

  // If expr is unsigned and declared is unsigned, allow if expr bits <= declared bits
  if (!exprSigned && !declaredSigned) {
    return exprBits <= declaredBits;
  }

  // If expr is signed and declared is signed, allow if expr bits <= declared bits
  if (exprSigned && declaredSigned) {
    return exprBits <= declaredBits;
  }

  // If expr is unsigned and declared is signed, allow if expr fits in signed range
  // U8 (0-255) fits in I16 (-32768 to 32767) but not I8 (-128 to 127)
  if (!exprSigned && declaredSigned) {
    return exprBits < declaredBits;
  }

  // If expr is signed and declared is unsigned, reject
  // Signed values can't safely go into unsigned types
  return false;
}

export function isPointerType(type: string): boolean {
  return type.startsWith("*");
}

export function getPointerBaseType(type: string): string | undefined {
  if (!isPointerType(type)) return undefined;
  let baseType = type.substring(1);
  // Handle *mut by removing "mut " prefix
  if (baseType.startsWith("mut ")) {
    baseType = baseType.substring(4);
  }
  return baseType;
}

export function isMutablePointerType(type: string): boolean {
  if (!isPointerType(type)) return false;
  const afterStar = type.substring(1);
  return afterStar.startsWith("mut");
}

export function isSliceType(type: string): boolean {
  // Slice type: *[ElementType] or *mut [ElementType]
  if (!type.startsWith("*")) return false;
  let afterStar = type.substring(1);
  if (afterStar.startsWith("mut ")) {
    afterStar = afterStar.substring(4);
  }
  return (
    afterStar.startsWith("[") &&
    afterStar.endsWith("]") &&
    !afterStar.includes(";")
  );
}

export function getSliceElementType(type: string): string | undefined {
  if (!isSliceType(type)) return undefined;
  let afterStar = type.substring(1);
  if (afterStar.startsWith("mut ")) {
    afterStar = afterStar.substring(4);
  }
  // Extract from [ElementType]
  const inner = afterStar.substring(1, afterStar.length - 1);
  return inner;
}

export function isMutableSliceType(type: string): boolean {
  if (!isSliceType(type)) return false;
  const afterStar = type.substring(1);
  return afterStar.startsWith("mut");
}

export function isArrayType(type: string): boolean {
  return type.startsWith("[") && type.includes(";");
}

export function getArrayElementType(type: string): string | undefined {
  if (!isArrayType(type)) return undefined;
  const parts = parseArrayTypeComponents(type);
  if (!parts) return undefined;
  return parts[0];
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

export function buildStoreHaltInstructions(opcode: OpCode): Instruction[] {
  return [
    {
      opcode,
      variant: Variant.Immediate,
      operand1: 1,
      operand2: 0,
    },
    ...buildStoreAndHalt(),
  ];
}
