import type { ScopeStack } from "../core/scopes.js";

/** The `number` type. */
export interface TypeNumber {
  kind: "number";
}

/** The `bool` type. */
export interface TypeBool {
  kind: "bool";
}

/**
 * An integer type. A concrete fixed-width type (`u8`, `i32`, `usize`, ...) or
 * the internal `Int` supertype of all integer types (the type of an
 * unsuffixed integer literal). `Int` is unnameable in `is` type-tests.
 */
export interface TypeInt {
  kind: "int";
  /** The type name: a concrete suffix (`u8`, `i32`, `usize`, ...) or `INT_ANY`. */
  name: string;
}

/**
 * A float type. A concrete fixed-width type (`f32`, `f64`) or the internal
 * `Float` supertype of all float types (the type of an unsuffixed fractional
 * literal). `Float` is unnameable in `is` type-tests.
 */
export interface TypeFloat {
  kind: "float";
  /** The type name: a concrete suffix (`f32`, `f64`) or `FLOAT_ANY`. */
  name: string;
}

/** The name of the internal `Int` supertype (unnameable in source). */
export const INT_ANY = "int";

/** The name of the internal `Float` supertype (unnameable in source). */
export const FLOAT_ANY = "float";

/** An array of a single element type. */
export interface TypeArray {
  kind: "array";
  element: Type;
}

/**
 * A (possibly nested) pointer carrying a mutability flag. Pointers are
 * structured so `&mut` can be distinguished from `&` when checking
 * assignments through a dereference.
 */
export interface TypePtr {
  kind: "ptr";
  mutable: boolean;
  pointee: Type;
}

/** A numeric range (`start..end`), exclusive of `end`. */
export interface TypeRange {
  kind: "range";
  element: Type;
}

/** A static type: a primitive, an array, a pointer, or a range. */
export type Type = TypeNumber | TypeBool | TypeInt | TypeFloat | TypeArray | TypePtr | TypeRange;

/** Render a type as its display name (e.g. `ptr<number>`, `array<number>`). */
export function typeToString(type: Type): string {
  if (type.kind === "ptr") {
    return `ptr<${typeToString(type.pointee)}>`;
  }
  if (type.kind === "array") {
    return `array<${typeToString(type.element)}>`;
  }
  if (type.kind === "range") {
    return `range<${typeToString(type.element)}>`;
  }
  if (type.kind === "int" || type.kind === "float") {
    return type.name;
  }
  return type.kind;
}

/** The inclusive value range of each concrete integer type. */
export const INT_BOUNDS: Record<string, [number, number]> = {
  u8: [0, 255],
  u16: [0, 65535],
  u32: [0, 4294967295],
  u64: [0, 2 ** 64 - 1],
  usize: [0, 2 ** 64 - 1],
  i8: [-128, 127],
  i16: [-32768, 32767],
  i32: [-(2 ** 31), 2 ** 31 - 1],
  i64: [-(2 ** 63), 2 ** 63 - 1],
};

/**
 * The value range of an unsuffixed integer literal: the span from the smallest
 * signed 64-bit value to the largest unsigned 64-bit value.
 */
export const INT_LITERAL_BOUNDS: [number, number] = [-(2 ** 63), 2 ** 64 - 1];

/** Whether a literal value fits in the named concrete integer type. */
export function intLiteralInRange(name: string, value: number): boolean {
  const bounds = INT_BOUNDS[name];
  return bounds ? value >= bounds[0] && value <= bounds[1] : false;
}

/** The promotion rank of a float type: wider types rank higher. */
const FLOAT_RANK: Record<string, number> = {
  f32: 1,
  f64: 2,
};

/** The float type names, for resolving `is` type-test names. */
const FLOAT_NAMES = new Set(Object.keys(FLOAT_RANK));

/** The unsigned integer type names, which may index arrays. */
const UNSIGNED_INTS = new Set(["u8", "u16", "u32", "u64", "usize"]);

/** Whether a concrete integer type is unsigned (and so may index arrays). */
export function isUnsignedInt(name: string): boolean {
  return UNSIGNED_INTS.has(name);
}

/**
 * Whether a concrete integer type is a subtype of another: the same type, or
 * `usize` under `u64` (every `usize` value is a `u64` value on a 64-bit
 * machine). The `Int` supertype is handled by the caller.
 */
function intSubtype(aName: string, bName: string): boolean {
  return aName === bName || (aName === "usize" && bName === "u64");
}

/**
 * The least concrete integer type whose range contains both operands' ranges
 * (the range-based least upper bound), or `undefined` when no concrete type
 * can hold both (e.g. `u64` and `i64`). Ties on range width (e.g. `usize` and
 * `u64`) resolve to the supertype.
 */
function intLub(aName: string, bName: string): Type | undefined {
  if (aName === bName) {
    return { kind: "int", name: aName };
  }
  const aBounds = INT_BOUNDS[aName];
  const bBounds = INT_BOUNDS[bName];
  let best: string | undefined;
  let bestWidth = Infinity;
  for (const [name, [lo, hi]] of Object.entries(INT_BOUNDS)) {
    if (lo <= aBounds[0] && aBounds[1] <= hi && lo <= bBounds[0] && bBounds[1] <= hi) {
      // A candidate must be a supertype of both operands: exclude a type that
      // is a proper subtype of either operand (e.g. `usize` is not a supertype
      // of `u64`, so it is not a candidate for `usize + u64`).
      if (name !== aName && intSubtype(name, aName)) continue;
      if (name !== bName && intSubtype(name, bName)) continue;
      const width = hi - lo;
      if (width < bestWidth || (width === bestWidth && best && intSubtype(name, best))) {
        best = name;
        bestWidth = width;
      }
    }
  }
  return best ? { kind: "int", name: best } : undefined;
}

/**
 * Promote two arithmetic operand types to their common result type, or
 * `undefined` when no common type exists. `Int` yields to any concrete type
 * (`Int + u8` is `u8`); two concrete integers promote to the least concrete
 * type whose range contains both; a float dominates an integer; two floats
 * promote to the wider.
 */
export function promote(a: Type, b: Type): Type | undefined {
  if (a.kind === "int" && b.kind === "int") {
    if (a.name === INT_ANY) {
      return b;
    }
    if (b.name === INT_ANY) {
      return a;
    }
    return intLub(a.name, b.name);
  }
  if (a.kind === "float" && b.kind === "float") {
    if (a.name === FLOAT_ANY) {
      return b;
    }
    if (b.name === FLOAT_ANY) {
      return a;
    }
    return FLOAT_RANK[a.name] >= FLOAT_RANK[b.name] ? a : b;
  }
  if (a.kind === "float" || b.kind === "float") {
    // A float dominates an integer operand.
    return a.kind === "float" ? a : b;
  }
  return undefined;
}

/**
 * Resolve a type name as written in an `is` type-test to a `Type`. Accepts
 * the integer names (`U8`..`U64`, `I8`..`I64`, `USize`), the float names
 * (`F32`, `F64`), and `Bool` (case-insensitive); returns `undefined` for
 * anything else. `Int` and `Float` are internal supertypes and cannot be
 * named.
 */
export function typeFromName(name: string): Type | undefined {
  const lower = name.toLowerCase();
  if (INT_BOUNDS[lower]) {
    return { kind: "int", name: lower };
  }
  if (FLOAT_NAMES.has(lower)) {
    return { kind: "float", name: lower };
  }
  if (lower === "bool") {
    return { kind: "bool" };
  }
  return undefined;
}

/** Two types are equal when their structure matches (kind, element, pointee, mutability). */
export function typesEqual(a: Type, b: Type): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "array" && b.kind === "array") {
    return typesEqual(a.element, b.element);
  }
  if (a.kind === "ptr" && b.kind === "ptr") {
    return a.mutable === b.mutable && typesEqual(a.pointee, b.pointee);
  }
  if (a.kind === "range" && b.kind === "range") {
    return typesEqual(a.element, b.element);
  }
  if (a.kind === "int" && b.kind === "int") {
    return a.name === b.name;
  }
  if (a.kind === "float" && b.kind === "float") {
    return a.name === b.name;
  }
  return true;
}

/**
 * Whether `a` is a subtype of `b` (or identical): `Int` is a supertype of all
 * integer types, `Float` of all float types, `usize` is a subtype of `u64`,
 * and compound types are subtypes structurally. Used for assignments, `is`
 * type-tests, and `==`/`!=` operand checks.
 */
export function isSubtype(a: Type, b: Type): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  if (a.kind === "int" && b.kind === "int") {
    return b.name === INT_ANY || intSubtype(a.name, b.name);
  }
  if (a.kind === "float" && b.kind === "float") {
    return b.name === FLOAT_ANY || a.name === b.name;
  }
  if (a.kind === "array" && b.kind === "array") {
    return isSubtype(a.element, b.element);
  }
  if (a.kind === "ptr" && b.kind === "ptr") {
    return a.mutable === b.mutable && isSubtype(a.pointee, b.pointee);
  }
  if (a.kind === "range" && b.kind === "range") {
    return isSubtype(a.element, b.element);
  }
  return true;
}

/** A variable's declared type and mutability, tracked across scopes. */
export interface Decl {
  type: Type;
  mutable: boolean;
}

/** A stack of variable declarations, innermost last. */
export type DeclScopes = ScopeStack<Decl>;
