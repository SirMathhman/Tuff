import type { ScopeStack } from "../core/scopes.js";
import type { Type } from "./types.js";

/** A numeric value. */
export interface TypedValueNumber {
  kind: "number";
  value: number;
}

/** A boolean value. */
export interface TypedValueBool {
  kind: "bool";
  value: boolean;
}

/** An array value: its element type and the elements. */
export interface TypedValueArray {
  kind: "array";
  element: Type;
  elements: TypedValue[];
}

/** A pointer value: mutability, the pointee type, and the referenced variable. */
export interface TypedValuePtr {
  kind: "ptr";
  mutable: boolean;
  pointee: Type;
  ref: Variable;
}

/**
 * A value with its static type, so `==` can compare type-strictly. `kind` is
 * the discriminant (matching the structured `Type` from the typecheck pass);
 * each variant carries the payload for that kind, so narrowing on `kind` also
 * narrows the payload.
 */
export type TypedValue =
  TypedValueNumber | TypedValueBool | TypedValueArray | TypedValuePtr | TypedValueRange;

/** A variable's value with its type, so assignments can be type-checked. */
export interface Variable {
  value: TypedValue;
  mutable: boolean;
}

/** A stack of variable scopes, innermost last. */
export type Scopes = ScopeStack<Variable>;

/** A numeric range value, exclusive of `end`. */
export interface TypedValueRange {
  kind: "range";
  /** The element type of the range (matching the `range` type). */
  element: Type;
  start: number;
  end: number;
}

/** A pointer variant of `TypedValue`, at any nesting depth. */
type PointerValue = TypedValuePtr;

/** An array variant of `TypedValue`. */
type ArrayValue = TypedValueArray;

/** A range variant of `TypedValue`. */
type RangeValue = TypedValueRange;

/** Type guard: is this a pointer value? */
export function isPointer(t: TypedValue): t is PointerValue {
  return t.kind === "ptr";
}

/** Type guard: is this an array value? */
export function isArray(t: TypedValue): t is ArrayValue {
  return t.kind === "array";
}

/** Type guard: is this a range value? */
export function isRange(t: TypedValue): t is RangeValue {
  return t.kind === "range";
}
