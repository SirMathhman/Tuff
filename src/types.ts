/**
 * Type system for the Tuff language.
 * Single source of truth for all types, compatibility rules, and parsing.
 */

/** Numeric type with a prefix (U/I/F) and bit width. */
export interface NumericType {
  kind: "numeric";
  prefix: "U" | "I" | "F";
  bits: number;
}

/** Boolean type. */
export interface BoolType {
  kind: "bool";
}

/** Dynamic / unknown type (no annotation, no suffix). */
export interface DynamicType {
  kind: "dynamic";
}

/** All possible types in the Tuff language. */
export type Type = NumericType | BoolType | DynamicType;

/** Construct a numeric type. */
export function numeric(prefix: "U" | "I" | "F", bits: number): NumericType {
  return { kind: "numeric", prefix, bits };
}

/** Construct a boolean type. */
export function bool(): BoolType {
  return { kind: "bool" };
}

/** Construct a dynamic type. */
export function dynamic(): DynamicType {
  return { kind: "dynamic" };
}

/** Check if a type is numeric. */
export function isNumeric(t: Type): t is NumericType {
  return t.kind === "numeric";
}

/** Check if a type is boolean. */
export function isBool(t: Type): t is BoolType {
  return t.kind === "bool";
}

/** Check if a type is dynamic. */
export function isDynamic(t: Type): t is DynamicType {
  return t.kind === "dynamic";
}

/** Get bit width for numeric types, 0 otherwise. */
export function getBits(t: Type): number {
  return t.kind === "numeric" ? t.bits : 0;
}

/**
 * Check if source type is assignable to target type.
 * - Dynamic → anything: always OK
 * - Bool → Bool: exact match
 * - Numeric → Numeric: same prefix family, source.bits <= target.bits
 * - Bool ↔ Numeric: never OK
 */
export function isAssignable(source: Type, target: Type): boolean {
  if (isDynamic(source)) return true;
  if (isBool(target)) return isBool(source);
  if (isBool(source)) return false;
  if (!isNumeric(target) || !isNumeric(source)) return false;
  return source.prefix === target.prefix && source.bits <= target.bits;
}

/**
 * Widen two types: if one is dynamic, use the other. If both concrete numeric, use wider.
 * Shared by analyzer and optimizer.
 */
export function widen(a: Type, b: Type): Type {
  if (isDynamic(a)) return b;
  if (isDynamic(b)) return a;
  if (isNumeric(a) && isNumeric(b)) return a.bits >= b.bits ? a : b;
  return a;
}

/** Parse a type name string into a Type. Returns dynamic() for unknown names. */
export function parseTypeName(name: string): Type {
  if (name === "Bool") return bool();
  const match = name.match(/^([UIF])(\d+)$/);
  if (match) {
    const prefix = match[1] as "U" | "I" | "F";
    const bits = Number(match[2]);
    return numeric(prefix, bits);
  }
  return dynamic();
}

/** Convert a Type back to a string for error messages. */
export function typeName(t: Type): string {
  if (t.kind === "numeric") return `${t.prefix}${t.bits}`;
  if (t.kind === "bool") return "Bool";
  return "dynamic";
}
