// Type model: the single source of truth for Tuff's type system.
// Owns the type table, literal suffix recognition, range validation, type
// inference, and assignability. The checker, tokenizer, and future codegen
// all reference this module instead of maintaining ad-hoc type logic.

import type { ASTNode, Type } from "./ast";

// Type kind: whether a type is an integer, a boolean, or void (no value).
type TypeKind = "int" | "bool" | "void";

// Signedness of an integer type. "generic" is used for the default "Int"
// type of untyped literals, which can widen to any integer type.
type Signedness = "signed" | "unsigned" | "generic";

// Metadata for a type: its kind, signedness, and bit width. The default
// "Int" type uses bits 0 to mean "any width".
interface TypeInfo {
  kind: TypeKind;
  signedness: Signedness;
  bits: number;
}

// The type table: the single source of truth for known types.
const TYPES = new Map<string, TypeInfo>([
  ["U8", { kind: "int", signedness: "unsigned", bits: 8 }],
  ["U16", { kind: "int", signedness: "unsigned", bits: 16 }],
  ["U64", { kind: "int", signedness: "unsigned", bits: 64 }],
  ["I32", { kind: "int", signedness: "signed", bits: 32 }],
  // "Int" is the default type of an untyped integer literal. Its "generic"
  // signedness and 0 bits make it assignable to any integer type (widening),
  // but its "int" kind prevents it from being assigned to a boolean.
  ["Int", { kind: "int", signedness: "generic", bits: 0 }],
  ["Bool", { kind: "bool", signedness: "generic", bits: 0 }],
  // "Void" represents the absence of a value (e.g. a function with no
  // meaningful return). It is only assignable to itself.
  ["Void", { kind: "void", signedness: "generic", bits: 0 }],
]);

// Inclusive value range for a type, used to validate typed literals.
interface TypeRange {
  min: number;
  max: number;
}

// Inclusive value ranges for each type, used to validate typed literals.
const TYPE_RANGES = new Map<string, TypeRange>([
  ["U8", { min: 0, max: 255 }],
  ["U16", { min: 0, max: 65535 }],
  ["U64", { min: 0, max: 9007199254740991 }],
  ["I32", { min: -2147483648, max: 2147483647 }],
]);

// Recognized literal type suffixes, longest-first so that multi-character
// suffixes (e.g. "U16") are matched before shorter ones (e.g. "U8").
export const SUFFIXES: string[] = ["U64", "U16", "U8"];

// Render a Type as a display string (e.g. "I32", "&I32", "&mut I32",
// "[I32; 3]") for error messages.
export function formatType(t: Type): string {
  if (t.kind === "named") {
    return t.name;
  }
  if (t.kind === "ref") {
    return (t.isMut ? "&mut " : "&") + formatType(t.inner);
  }
  return "[" + formatType(t.elem) + "; " + t.length + "]";
}

// Whether a Type is well-formed: named types must exist in the TYPES table,
// and reference/array types must have well-formed inner types.
export function isKnownType(t: Type): boolean {
  if (t.kind === "named") {
    return TYPES.has(t.name);
  }
  if (t.kind === "ref") {
    return isKnownType(t.inner);
  }
  return isKnownType(t.elem);
}

// Side-table mapping each AST node to its inferred type. The checker computes
// each node's type once during its single pass and stores it here, so type
// lookup is O(1) instead of re-walking the AST. A WeakMap keeps the AST as a
// pure data structure (no `type` field on every node) and avoids leaking
// memory once nodes are garbage-collected.
const NODE_TYPES = new WeakMap<ASTNode, Type>();

// Record the inferred type of a node. Called by the checker as it walks.
export function setNodeType(node: ASTNode, type: Type): void {
  NODE_TYPES.set(node, type);
}

// Infer the type of a node, if it has one. Returns undefined for nodes whose
// type is unknown (e.g. statements, or nodes the checker hasn't visited).
// This is a lookup into the side-table populated by the checker.
export function inferType(node: ASTNode): Type | undefined {
  return NODE_TYPES.get(node);
}

// The kind of conversion needed to go from type `from` to type `to`:
//   - "none": the types are the same (or unknown), no conversion needed.
//   - "implicit": a lossless widening that can happen automatically.
//   - "explicit": a narrowing or signed/unsigned change that requires an
//     explicit cast (not yet implemented).
//   - "impossible": the conversion cannot be done (e.g. int to bool).
export type ConversionKind = "none" | "implicit" | "explicit" | "impossible";

export function conversionKind(from: Type, to: Type): ConversionKind {
  // Reference types: "&X" is assignable to "&Y" when X is assignable to Y
  // (e.g. the generic "Int" widens to a concrete integer type). A mutable
  // reference "&mut X" is only assignable to another "&mut Y" where X is
  // assignable to Y.
  if (from.kind === "ref" && to.kind === "ref") {
    if (from.isMut !== to.isMut) {
      // Immutable and mutable references are not interchangeable.
      return "impossible";
    }
    return conversionKind(from.inner, to.inner);
  }
  if (from.kind === "ref" || to.kind === "ref") {
    // A reference is never assignable to a non-reference (or vice versa).
    return "impossible";
  }
  // Array types: "[X; N]" is assignable to "[Y; M]" when X is assignable to Y
  // and the lengths match.
  if (from.kind === "array" && to.kind === "array") {
    if (from.length !== to.length) {
      return "impossible";
    }
    return conversionKind(from.elem, to.elem);
  }
  if (from.kind === "array" || to.kind === "array") {
    // An array is never assignable to a non-array (or vice versa).
    return "impossible";
  }
  // Both are named types.
  const f = TYPES.get(from.name);
  const t = TYPES.get(to.name);
  // Unknown types are treated as compatible (don't reject).
  if (f === undefined || t === undefined) {
    return "none";
  }
  if (f.kind !== t.kind) {
    return "impossible";
  }
  if (f.kind === "bool") {
    return "none";
  }
  if (f.kind === "void") {
    // Void is only assignable to void (same kind, already checked).
    return "none";
  }
  // int -> int:
  // The generic "Int" type widens to any integer type.
  if (f.signedness === "generic") {
    return "implicit";
  }
  // Same signedness: allow widening (f.bits <= t.bits).
  if (f.signedness === t.signedness) {
    return f.bits <= t.bits ? "implicit" : "explicit";
  }
  // Signed <-> unsigned: only allow implicitly if the target is strictly
  // wider (avoids silent value corruption); otherwise require an explicit
  // cast.
  return f.bits < t.bits ? "implicit" : "explicit";
}

// Whether a value of type `from` can be assigned to a variable declared with
// type `to`. Widening is allowed; narrowing and signed/unsigned changes at
// equal width are not. Different kinds (int vs bool) are never assignable.
// Unknown types are treated as assignable (don't reject).
export function isAssignable(from: Type, to: Type): boolean {
  return (
    conversionKind(from, to) !== "explicit" &&
    conversionKind(from, to) !== "impossible"
  );
}

// Whether a value's type `from` matches the checked type `to` for the `is`
// operator. This is a type-IDENTITY check (not assignability): the types
// must be the same, except the generic "Int" type (the default of untyped
// integer literals) matches any integer type. So `100U8 is U16` is false
// (U8 != U16), but `100 is I32` is true (generic Int matches any int).
export function typeMatches(from: Type, to: Type): boolean {
  if (from.kind === "named" && to.kind === "named" && from.name === to.name) {
    return true;
  }
  if (from.kind !== "named" || to.kind !== "named") {
    return false;
  }
  const f = TYPES.get(from.name);
  const t = TYPES.get(to.name);
  // Unknown types don't match.
  if (f === undefined || t === undefined) {
    return false;
  }
  // The generic "Int" type matches any integer type.
  return f.signedness === "generic" && t.kind === "int";
}

// Return an error message if a value of type `valueType` cannot be assigned
// to a variable declared with type `declaredType`, or undefined if allowed.
export function typeMismatch(
  declaredType: Type,
  valueType: Type,
): string | undefined {
  if (!isAssignable(valueType, declaredType)) {
    return (
      "Cannot assign value of type '" +
      formatType(valueType) +
      "' to variable of type '" +
      formatType(declaredType) +
      "'"
    );
  }
  return undefined;
}

// Return an error message if `value` is out of range for `type`, or undefined
// if it fits (or the type is unknown).
export function rangeError(
  value: number,
  type: string | undefined,
): string | undefined {
  if (type === undefined) {
    return undefined;
  }
  const range = TYPE_RANGES.get(type);
  if (range === undefined) {
    return undefined;
  }
  if (value < range.min || value > range.max) {
    return "Value " + value + " out of range for " + type;
  }
  return undefined;
}
