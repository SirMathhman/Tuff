export type Result<T, E> = { success: true; data: T } | { success: false; error: E };

export type Variable = { name: string; type: string; value: number | bigint | string | (number | bigint)[]; mutable: boolean };

export type FunctionParameter = { name: string; type: string };

export type FunctionDef = { name: string; parameters: FunctionParameter[]; returnType: string; body: string };

export type VariableScope = {
  variables: Map<string, Variable>;
  functions: Map<string, FunctionDef>;
  parent: VariableScope | null;
};

export type Range = { min: number | bigint; max: number | bigint; unsigned: boolean };

export const TYPE_RANGES: Record<string, Range> = {
  Bool: { min: 0, max: 1, unsigned: true },
  U8: { min: 0, max: 255, unsigned: true },
  U16: { min: 0, max: 65535, unsigned: true },
  U32: { min: 0, max: 4294967295, unsigned: true },
  U64: { min: 0n, max: 18446744073709551615n, unsigned: true },
  I8: { min: -128, max: 127, unsigned: false },
  I16: { min: -32768, max: 32767, unsigned: false },
  I32: { min: -2147483648, max: 2147483647, unsigned: false },
  I64: { min: -9223372036854775808n, max: 9223372036854775807n, unsigned: false },
};

export const TYPE_ORDER: string[] = ["Bool", "U8", "U16", "U32", "U64", "I8", "I16", "I32", "I64"];

// Utility functions for pointer type handling
export function isPointerType(type: string): boolean {
  return type.startsWith("*");
}

export function isMutablePointerType(type: string): boolean {
  return type.startsWith("*mut ");
}

export function isImmutablePointerType(type: string): boolean {
  return isPointerType(type) && !isMutablePointerType(type);
}

export function getPointeeType(type: string): string {
  if (!isPointerType(type)) {
    throw new Error("Not a pointer type: " + type);
  }
  if (isMutablePointerType(type)) {
    return type.slice(5); // Remove "*mut "
  }
  return type.slice(1); // Remove "*"
}

export function getBaseType(type: string): string {
  let current = type;
  while (isPointerType(current)) {
    current = getPointeeType(current);
  }
  return current;
}

export function pointerDepth(type: string): number {
  let depth = 0;
  let current = type;
  while (isPointerType(current)) {
    depth++;
    current = getPointeeType(current);
  }
  return depth;
}

export function stripMutability(type: string): string {
  if (isMutablePointerType(type)) {
    return "*" + getPointeeType(type);
  }
  return type;
}

// Array type handling
export function isArrayType(type: string): boolean {
  return type.startsWith("[") && type.includes(";");
}

export function parseArrayType(type: string): { elementType: string; initialized: number; total: number } | null {
  if (!isArrayType(type)) {
    return null;
  }
  // Parse [Type; Initialized; Total]
  const match = type.match(/^\[([a-zA-Z0-9*mut ]+);\s*(\d+);\s*(\d+)\]$/);
  if (!match) {
    return null;
  }
  return {
    elementType: match[1],
    initialized: parseInt(match[2], 10),
    total: parseInt(match[3], 10),
  };
}

export function getArrayElementType(type: string): string | null {
  const parsed = parseArrayType(type);
  if (!parsed) {
    return null;
  }
  return parsed.elementType;
}

export function updateArrayInitializedCount(type: string, newInitialized: number): string | null {
  const parsed = parseArrayType(type);
  if (!parsed) {
    return null;
  }
  // Cap at total capacity
  const initialized = Math.min(newInitialized, parsed.total);
  return "[" + parsed.elementType + "; " + initialized + "; " + parsed.total + "]";
}

export function isBaseType(type: string): boolean {
  return TYPE_RANGES[type] !== undefined;
}