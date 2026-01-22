import { type Instruction } from "./vm";
import { isIdentifierChar } from "./parser";
import {
  buildStoreAndHalt,
  buildLoadImmediate,
} from "./instruction-primitives";

export interface SliceFieldAccess {
  sliceName: string;
  field: "init" | "total";
}

export function isSliceFieldAccess(source: string): boolean {
  // Pattern: identifier.field where field is "init" or "total"
  const trimmed = source.trim();
  const dotIndex = findDotOperator(trimmed);
  if (dotIndex === -1) return false;

  const slicePart = trimmed.substring(0, dotIndex).trim();
  const fieldPart = trimmed.substring(dotIndex + 1).trim();

  // Check if slice part is a valid identifier
  if (!isValidIdentifier(slicePart)) return false;

  // Check if field is "init" or "total"
  return fieldPart === "init" || fieldPart === "total";
}

function findDotOperator(source: string): number {
  for (let i = 0; i < source.length; i++) {
    if (source[i] === ".") {
      return i;
    }
  }
  return -1;
}

function isValidIdentifier(str: string): boolean {
  if (str.length === 0) return false;
  const firstChar = str[0];
  if (!firstChar || !isIdentifierChar(firstChar, true)) return false;
  for (let i = 1; i < str.length; i++) {
    const char = str[i];
    if (!char || !isIdentifierChar(char, false)) return false;
  }
  return true;
}

export function parseSliceFieldAccess(
  source: string,
): SliceFieldAccess | undefined {
  const trimmed = source.trim();
  const dotIndex = findDotOperator(trimmed);
  if (dotIndex === -1) return undefined;

  const sliceName = trimmed.substring(0, dotIndex).trim();
  const field = trimmed.substring(dotIndex + 1).trim();

  if (field !== "init" && field !== "total") {
    return undefined;
  }

  return { sliceName, field };
}

export function buildSliceFieldAccessInstructions(
  arrayBinding: { type?: string } | undefined,
  field: "init" | "total",
): Instruction[] | undefined {
  if (!arrayBinding?.type || !arrayBinding.type.startsWith("[")) {
    return undefined;
  }

  // Parse array type [ElementType; init; total]
  const typeStr = arrayBinding.type;
  const inner = typeStr.substring(1, typeStr.length - 1);
  const parts = inner.split(";");
  if (parts.length !== 3) return undefined;

  const initCount = parseInt(parts[1]?.trim() ?? "0", 10);
  const totalCount = parseInt(parts[2]?.trim() ?? "0", 10);

  if (field === "init") {
    return [buildLoadImmediate(1, initCount), ...buildStoreAndHalt()];
  }

  if (field === "total") {
    return [buildLoadImmediate(1, totalCount), ...buildStoreAndHalt()];
  }

  return undefined;
}
