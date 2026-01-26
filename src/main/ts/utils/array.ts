import { extractTypeSize } from "../type-utils";

// Global array storage: maps array ID to its data
// Each array stores: {type: elementType, initialized: count, capacity: count, values: number[]}
const arrays = new Map<
  number,
  { type: number; initialized: number; capacity: number; values: number[] }
>();
let nextArrayId = 2000000; // Start from high number to avoid conflicts

export interface ArrayType {
  elementType: number;
  initializedCount: number;
  capacity: number;
}

function parseArrayTypeParts(typeStr: string): string[] | undefined {
  const t = typeStr.trim();
  if (!t.startsWith("[") || !t.includes(";")) return undefined;

  const closeIdx = t.lastIndexOf("]");
  if (closeIdx === -1) return undefined;

  const inner = t.slice(1, closeIdx).trim();
  const parts = inner.split(";").map((p) => p.trim());
  return parts.length === 3 ? parts : undefined;
}

export function parseArrayType(typeStr: string): ArrayType | undefined {
  const parts = parseArrayTypeParts(typeStr);
  if (!parts) return undefined;

  const initialStr = parts[1];
  const capacityStr = parts[2];
  const initialized = Number(initialStr);
  const capacity = Number(capacityStr);

  if (!Number.isFinite(initialized) || !Number.isFinite(capacity))
    return undefined;
  if (initialized < 0 || capacity < initialized) return undefined;

  // elementType would be resolved elsewhere (e.g., "I32" -> 32)
  return { elementType: 0, initializedCount: initialized, capacity };
}

export function isArrayTypeAnnotation(typeStr: string): boolean {
  return parseArrayType(typeStr) !== undefined;
}

export function extractArrayTypeInfo(
  typeStr: string,
  typeMap: Map<string, number>,
): { arrayType: ArrayType; elementTypeName: string } | undefined {
  const baseArrayType = parseArrayType(typeStr);
  if (!baseArrayType) return undefined;

  const parts = parseArrayTypeParts(typeStr);
  if (!parts) return undefined;

  const elemTypeStr = parts[0]?.trim();

  if (!elemTypeStr) return undefined;

  let elementType = extractTypeSize(elemTypeStr);
  if (elementType === 0 && typeMap.has("__alias__" + elemTypeStr)) {
    elementType = typeMap.get("__alias__" + elemTypeStr) || 0;
  }

  return {
    arrayType: {
      elementType,
      initializedCount: baseArrayType.initializedCount,
      capacity: baseArrayType.capacity,
    },
    elementTypeName: elemTypeStr,
  };
}

export function parseArrayLiteral(s: string): number[] | undefined {
  const t = s.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return undefined;
  if (t.includes(";")) return undefined; // This is a type annotation, not a literal

  const inner = t.slice(1, -1).trim();
  if (inner === "") return [];

  const parts = inner.split(",").map((p) => p.trim());
  const values: number[] = [];

  for (const part of parts) {
    const num = Number(part);
    if (!Number.isFinite(num)) return undefined;
    values.push(num);
  }

  return values;
}

export function createArray(
  elementType: number,
  initializedCount: number,
  capacity: number,
  values: number[],
): number {
  const arrayId = nextArrayId++;
  arrays.set(arrayId, {
    type: elementType,
    initialized: initializedCount,
    capacity,
    values,
  });
  return arrayId;
}

export function getArrayElement(
  arrayId: number,
  index: number,
): number | undefined {
  const arr = arrays.get(arrayId);
  if (!arr) return undefined;
  if (index < 0 || index >= arr.initialized) return undefined;
  return arr.values[index];
}

export function setArrayElement(
  arrayId: number,
  index: number,
  value: number,
): boolean {
  const arr = arrays.get(arrayId);
  if (!arr) return false;
  if (index < 0 || index >= arr.capacity) return false;
  arr.values[index] = value;
  if (index >= arr.initialized) {
    arr.initialized = index + 1;
  }
  return true;
}

export function isArrayInstance(value: number): boolean {
  return value >= 2000000 && value < 3000000;
}

export function getArrayMetadata(arrayId: number) {
  return arrays.get(arrayId);
}

export function createArrayFromLiteral(expr: string): number | undefined {
  const literal = parseArrayLiteral(expr);
  if (literal === undefined) return undefined;
  const len = literal.length;
  return createArray(0, len, len, literal);
}

// Global string storage: maps string ID to its value
const strings = new Map<number, string>();
let nextStringId = 3000000; // Start after array IDs (2M+)

export function createString(value: string): number {
  const stringId = nextStringId++;
  strings.set(stringId, value);
  return stringId;
}

export function getString(stringId: number): string | undefined {
  return strings.get(stringId);
}

export function isStringInstance(value: number): boolean {
  return value >= 3000000;
}

export function getStringLength(stringId: number): number | undefined {
  const str = strings.get(stringId);
  if (str === undefined) return undefined;
  return str.length;
}

export function getStringCharCode(
  stringId: number,
  index: number,
): number | undefined {
  if (index < 0) return undefined;
  const str = strings.get(stringId);
  if (str === undefined) return undefined;
  if (index >= str.length) return undefined;
  return str.charCodeAt(index);
}
