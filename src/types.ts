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

/** Void type (blocks ending with declarations). */
export interface VoidType {
  kind: "void";
}

/** Dynamic / unknown type (no annotation, no suffix). */
export interface DynamicType {
  kind: "dynamic";
}

/** Pointer type referencing another type. */
export interface PointerType {
  kind: "pointer";
  inner: Type;
}

/** All possible types in the Tuff language. */
export type Type =
  NumericType | BoolType | VoidType | DynamicType | PointerType;

/** Construct a numeric type. */
export function numeric(prefix: "U" | "I" | "F", bits: number): NumericType {
  return { kind: "numeric", prefix, bits };
}

/** Construct a boolean type. */
export function bool(): BoolType {
  return { kind: "bool" };
}

/** Construct a void type. */
export function voidType(): VoidType {
  return { kind: "void" };
}

/** Construct a dynamic type. */
export function dynamic(): DynamicType {
  return { kind: "dynamic" };
}

/** Construct a pointer type. */
export function pointer(inner: Type): PointerType {
  return { kind: "pointer", inner };
}

/** Check if a type is numeric. */
export function isNumeric(t: Type): t is NumericType {
  return t.kind === "numeric";
}

/** Check if a type is boolean. */
export function isBool(t: Type): t is BoolType {
  return t.kind === "bool";
}

/** Check if a type is void. */
export function isVoid(t: Type): t is VoidType {
  return t.kind === "void";
}

/** Check if a type is dynamic. */
export function isDynamic(t: Type): t is DynamicType {
  return t.kind === "dynamic";
}

/** Check if a type is a pointer type. */
export function isPointer(t: Type): t is PointerType {
  return t.kind === "pointer";
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
 * - Pointer → Pointer: inner types must be compatible
 * - Bool ↔ Numeric: never OK
 */
export function isAssignable(source: Type, target: Type): boolean {
  if (isDynamic(source)) return true;
  if (isBool(target)) return isBool(source);
  if (isBool(source)) return false;
  if (isPointer(target)) {
    if (!isPointer(source)) return false;
    return isAssignable(source.inner, target.inner);
  }
  if (isPointer(source)) return false;
  if (!isNumeric(target) || !isNumeric(source)) return false;
  return source.prefix === target.prefix && source.bits <= target.bits;
}

/**
 * Widen two types: if one is dynamic, use the other.
 * If both concrete numeric, find the smallest type that can hold both ranges:
 * - Same prefix: use the wider bit width.
 * - Mixed signed/unsigned (U+I): result is signed (I) with doubled bits.
 * - Any float (F): result is float with max bits.
 */
export function widen(a: Type, b: Type): Type {
  if (isDynamic(a)) return b;
  if (isDynamic(b)) return a;
  if (isNumeric(a) && isNumeric(b)) {
    // Any float dominates
    if (a.prefix === "F" || b.prefix === "F") {
      return numeric("F", Math.max(a.bits, b.bits));
    }
    // Mixed signed/unsigned: result is signed with doubled bits
    if (a.prefix !== b.prefix) {
      return numeric("I", Math.max(a.bits, b.bits) * 2);
    }
    // Same prefix: use wider
    return a.bits >= b.bits ? a : b;
  }
  return a;
}

/** Parse a type name string into a Type. Supports &TypeName for pointers. */
export function parseTypeName(name: string): Type {
  if (name === "Bool") return bool();
  if (name === "Void") return voidType();
  const ptrMatch = name.match(/^&(.+)$/);
  if (ptrMatch) {
    return pointer(parseTypeName(ptrMatch[1]!));
  }
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
  if (t.kind === "void") return "Void";
  if (t.kind === "pointer") return `&${typeName(t.inner)}`;
  return "dynamic";
}
