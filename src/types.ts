// Type model: the single source of truth for Tuff's type system.
// Owns the type table, literal suffix recognition, range validation, type
// inference, and assignability. The checker, tokenizer, and future codegen
// all reference this module instead of maintaining ad-hoc type logic.

import type { ASTNode } from "./ast";
import type { Scope } from "./scope";

// Type width ordering: narrower types can be safely widened to wider types.
// U8 is narrower than U16. Assigning a value of type T to a declared type D
// is allowed only when T is the same as or narrower than D (widening is
// safe, narrowing is not).
const TYPE_WIDTH = new Map<string, number>([
  ["U8", 1],
  ["U16", 2],
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
]);

// Recognized literal type suffixes, longest-first so that multi-character
// suffixes (e.g. "U16") are matched before shorter ones (e.g. "U8").
export const SUFFIXES: string[] = ["U16", "U8"];

// Whether a string is a known type name.
export function isKnownType(name: string): boolean {
  return TYPE_WIDTH.has(name);
}

// Infer the type of a node, if it has one. Returns undefined for nodes whose
// type is unknown (e.g. untyped literals, expressions). Identifiers resolve
// their type from the scope.
export function inferType(node: ASTNode, scope: Scope): string | undefined {
  if (node.kind === "number" && node.suffix !== undefined) {
    return node.suffix;
  }
  if (node.kind === "identifier") {
    return scope.typeOf(node.name);
  }
  return undefined;
}

// Whether a value of type `from` can be assigned to a variable declared with
// type `to`. Widening is allowed; narrowing is not. Unknown types are treated
// as assignable (don't reject).
export function isAssignable(from: string, to: string): boolean {
  const fromWidth = TYPE_WIDTH.get(from);
  const toWidth = TYPE_WIDTH.get(to);
  if (fromWidth === undefined || toWidth === undefined) {
    return true;
  }
  return fromWidth <= toWidth;
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
