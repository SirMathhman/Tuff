// Type model: the single source of truth for Tuff's type system.
// Owns the type table, literal suffix recognition, range validation, type
// inference, and assignability. The checker, tokenizer, and future codegen
// all reference this module instead of maintaining ad-hoc type logic.

import type { ASTNode } from "./ast";
import type { Scope } from "./scope";

// Type kind: whether a type is an integer or a boolean.
type TypeKind = "int" | "bool";

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
  ["I32", { kind: "int", signedness: "signed", bits: 32 }],
  // "Int" is the default type of an untyped integer literal. Its "generic"
  // signedness and 0 bits make it assignable to any integer type (widening),
  // but its "int" kind prevents it from being assigned to a boolean.
  ["Int", { kind: "int", signedness: "generic", bits: 0 }],
  ["Bool", { kind: "bool", signedness: "generic", bits: 0 }],
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
  ["I32", { min: -2147483648, max: 2147483647 }],
]);

// Recognized literal type suffixes, longest-first so that multi-character
// suffixes (e.g. "U16") are matched before shorter ones (e.g. "U8").
export const SUFFIXES: string[] = ["U16", "U8"];

// Whether a string is a known type name.
export function isKnownType(name: string): boolean {
  return TYPES.has(name);
}

// Infer the type of a node, if it has one. Returns undefined for nodes whose
// type is unknown (e.g. expressions). Identifiers resolve their type from the
// scope. Untyped number literals default to "Int"; typed literals use their
// suffix; boolean literals are "Bool".
export function inferType(node: ASTNode, scope: Scope): string | undefined {
  if (node.kind === "number") {
    return node.suffix ?? "Int";
  }
  if (node.kind === "boolean") {
    return "Bool";
  }
  if (node.kind === "identifier") {
    return scope.typeOf(node.name);
  }
  return undefined;
}

// The kind of conversion needed to go from type `from` to type `to`:
//   - "none": the types are the same (or unknown), no conversion needed.
//   - "implicit": a lossless widening that can happen automatically.
//   - "explicit": a narrowing or signed/unsigned change that requires an
//     explicit cast (not yet implemented).
//   - "impossible": the conversion cannot be done (e.g. int to bool).
export type ConversionKind = "none" | "implicit" | "explicit" | "impossible";

export function conversionKind(from: string, to: string): ConversionKind {
  const f = TYPES.get(from);
  const t = TYPES.get(to);
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
export function isAssignable(from: string, to: string): boolean {
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
export function typeMatches(from: string, to: string): boolean {
  if (from === to) {
    return true;
  }
  const f = TYPES.get(from);
  const t = TYPES.get(to);
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
  declaredType: string,
  valueType: string,
): string | undefined {
  if (!isAssignable(valueType, declaredType)) {
    return (
      "Cannot assign value of type '" +
      valueType +
      "' to variable of type '" +
      declaredType +
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
