import { splitByCommaRespectingNesting } from "../support/helpers";

/**
 * Array type format: [BaseType; InitializedLength; TotalLength]
 * Example: [U8; 2; 2] means array of U8, 2 elements initialized, 2 total slots
 */

export interface ArrayType {
  baseType: string;
  initializedLength: number;
  totalLength: number;
}

export interface ArrayLiteral {
  elements: string[]; // Array of expressions
}

export function isArrayType(typeStr: string): boolean {
  return typeStr.startsWith("[") && typeStr.includes(";");
}

export function parseArrayType(typeStr: string): ArrayType | undefined {
  if (!isArrayType(typeStr)) return undefined;

  // Format: [BaseType; InitializedLength; TotalLength]
  // Remove outer brackets
  if (!typeStr.startsWith("[") || !typeStr.endsWith("]")) return undefined;

  const inner = typeStr.substring(1, typeStr.length - 1).trim();
  const parts = inner.split(";").map((p) => p.trim());

  if (parts.length !== 3) return undefined;

  const baseType = parts[0];
  const initializedLengthStr = parts[1];
  const totalLengthStr = parts[2];

  if (!initializedLengthStr || !totalLengthStr) return undefined;

  const initializedLength = parseInt(initializedLengthStr, 10);
  const totalLength = parseInt(totalLengthStr, 10);

  if (isNaN(initializedLength) || isNaN(totalLength)) return undefined;
  if (initializedLength < 0 || totalLength < 0) return undefined;
  if (initializedLength > totalLength) return undefined;
  if (!baseType || baseType.length === 0) return undefined;

  return { baseType, initializedLength, totalLength };
}

export function isArrayLiteral(source: string): boolean {
  const trimmed = source.trim();
  return trimmed.startsWith("[") && trimmed.endsWith("]");
}

export function parseArrayLiteral(source: string): ArrayLiteral | undefined {
  const trimmed = source.trim();

  if (!isArrayLiteral(trimmed)) return undefined;

  const inner = trimmed.substring(1, trimmed.length - 1).trim();

  if (inner.length === 0) {
    return { elements: [] };
  }

  // Split by comma, but respect nested brackets
  return { elements: splitByCommaRespectingNesting(inner) };
}

export function formatArrayType(arrayType: ArrayType): string {
  return `[${arrayType.baseType}; ${arrayType.initializedLength}; ${arrayType.totalLength}]`;
}

export function getArrayMemorySize(arrayType: ArrayType): number {
  // Each element takes 1 memory slot (assuming simple scalar types)
  // Future: scale by base type size for larger types
  return arrayType.totalLength;
}
