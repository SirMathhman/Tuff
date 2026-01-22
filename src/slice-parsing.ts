import { type Instruction } from "./vm";
import { isIdentifierChar } from "./parser";
import {
  buildStoreAndHalt,
  buildLoadImmediate,
} from "./instruction-primitives";

export interface SliceFieldAccess {
  sliceName: string;
  field: "initialized" | "capacity";
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

  // Check if field is "initialized" or "capacity"
  return fieldPart === "initialized" || fieldPart === "capacity";
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

  if (field !== "initialized" && field !== "capacity") {
    return undefined;
  }

  return { sliceName, field };
}

export function buildSliceFieldAccessInstructions(
  arrayBinding: { type?: string } | undefined,
  field: "initialized" | "capacity",
): Instruction[] | undefined {
  if (!arrayBinding?.type || !arrayBinding.type.startsWith("[")) {
    return undefined;
  }

  // Parse array type [ElementType; initialized; capacity]
  const typeStr = arrayBinding.type;
  const inner = typeStr.substring(1, typeStr.length - 1);
  const parts = inner.split(";");
  if (parts.length !== 3) return undefined;

  const initializedCount = parseInt(parts[1]?.trim() ?? "0", 10);
  const capacityCount = parseInt(parts[2]?.trim() ?? "0", 10);

  if (field === "initialized") {
    return [buildLoadImmediate(1, initializedCount), ...buildStoreAndHalt()];
  }

  if (field === "capacity") {
    return [buildLoadImmediate(1, capacityCount), ...buildStoreAndHalt()];
  }

  return undefined;
}
