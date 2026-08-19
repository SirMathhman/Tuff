import type { Value } from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { lookup, type ScopeStack } from "../core/scopes.js";
import { typeToString, type Type } from "./types.js";

/**
 * A value with its static type, so `==` can compare type-strictly. `kind` is
 * the discriminant (matching the structured `Type` from the typecheck pass);
 * each variant carries the payload for that kind, so narrowing on `kind` also
 * narrows the payload.
 */
export type TypedValue =
  | { kind: "number"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "array"; element: Type; elements: TypedValue[] }
  | { kind: "ptr"; mutable: boolean; pointee: Type; ref: Variable };

/** A variable's value with its type, so assignments can be type-checked. */
export interface Variable {
  value: TypedValue;
  mutable: boolean;
}

/** A stack of variable scopes, innermost last. */
export type Scopes = ScopeStack<Variable>;

/** A pointer variant of `TypedValue`, at any nesting depth. */
type PointerValue = Extract<TypedValue, { kind: "ptr" }>;

/** An array variant of `TypedValue`. */
type ArrayValue = Extract<TypedValue, { kind: "array" }>;

/** Type guard: is this a pointer value? */
export function isPointer(t: TypedValue): t is PointerValue {
  return t.kind === "ptr";
}

/** Type guard: is this an array value? */
function isArray(t: TypedValue): t is ArrayValue {
  return t.kind === "array";
}

/** Evaluate a binary operation: `==`/`!=` compare type-strictly; ordering operators compare numerically. */
function evalBinary(
  value: Extract<Value, { kind: "binary" }>,
  scopes: Scopes,
): Result<TypedValue, EvalError> {
  const left = valueToTyped(value.left, scopes);
  if (!left.ok) {
    return left;
  }
  const right = valueToTyped(value.right, scopes);
  if (!right.ok) {
    return right;
  }
  if (value.operator === "+") {
    return evalAddition(value, left.value, right.value);
  }
  if (value.operator === "==" || value.operator === "!=") {
    const l = left.value;
    const r = right.value;
    let equal = false;
    if (l.kind === "number" && r.kind === "number") {
      equal = l.value === r.value;
    } else if (l.kind === "bool" && r.kind === "bool") {
      equal = l.value === r.value;
    }
    const result = value.operator === "==" ? equal : !equal;
    return ok({ kind: "number", value: result ? 1 : 0 });
  }
  return evalOrdering(value, left.value, right.value);
}

/** Compare two typed values with an ordering operator; bools coerce to 1/0. */
function evalOrdering(
  value: Extract<Value, { kind: "binary" }>,
  l: TypedValue,
  r: TypedValue,
): Result<TypedValue, EvalError> {
  // Pointers are rejected by the typecheck pass; this is a defensive fallback.
  const toNum = (t: TypedValue): Result<number, EvalError> => {
    if (t.kind === "number") {
      return ok(t.value);
    }
    if (t.kind === "bool") {
      return ok(t.value ? 1 : 0);
    }
    return err({
      kind: "TypeMismatch",
      name: value.operator,
      expected: "number",
      actual: typeToString(t),
      position: value.position,
    });
  };
  const leftNum = toNum(l);
  if (!leftNum.ok) {
    return leftNum;
  }
  const rightNum = toNum(r);
  if (!rightNum.ok) {
    return rightNum;
  }
  const result =
    value.operator === "<"
      ? leftNum.value < rightNum.value
      : value.operator === "<="
        ? leftNum.value <= rightNum.value
        : value.operator === ">"
          ? leftNum.value > rightNum.value
          : leftNum.value >= rightNum.value;
  return ok({ kind: "number", value: result ? 1 : 0 });
}

/** Evaluate `a + b`: numeric addition (both operands are numbers). */
function evalAddition(
  value: Extract<Value, { kind: "binary" }>,
  l: TypedValue,
  r: TypedValue,
): Result<TypedValue, EvalError> {
  // Operands are checked to be numbers by the typecheck pass; defensive fallback.
  if (l.kind !== "number" || r.kind !== "number") {
    return err({
      kind: "TypeMismatch",
      name: "+",
      expected: "number",
      actual: l.kind !== "number" ? typeToString(l) : typeToString(r),
      position: value.position,
    });
  }
  return ok({ kind: "number", value: l.value + r.value });
}

/** Evaluate an array literal `[e1, e2, ...]` into a typed array value. */
function evalArray(
  value: Extract<Value, { kind: "array" }>,
  scopes: Scopes,
): Result<TypedValue, EvalError> {
  const elements: TypedValue[] = [];
  for (const element of value.elements) {
    const typed = valueToTyped(element, scopes);
    if (!typed.ok) {
      return typed;
    }
    elements.push(typed.value);
  }
  const first = elements[0];
  const element: Type = first ?? { kind: "number" };
  return ok({ kind: "array", element, elements });
}

/** Evaluate `arr[i]`: the element of an array at a numeric index. */
function evalIndex(
  value: Extract<Value, { kind: "index" }>,
  scopes: Scopes,
): Result<TypedValue, EvalError> {
  const target = valueToTyped(value.target, scopes);
  if (!target.ok) {
    return target;
  }
  const index = valueToNumber(value.index, scopes);
  if (!index.ok) {
    return index;
  }
  if (!isArray(target.value)) {
    return err({
      kind: "TypeMismatch",
      name: "[",
      expected: "array<number>",
      actual: typeToString(target.value),
      position: value.position,
    });
  }
  const element = target.value.elements[index.value];
  if (element === undefined) {
    return err({
      kind: "TypeMismatch",
      name: "[",
      expected: "number",
      actual: "out-of-range",
      position: value.position,
    });
  }
  return ok(element);
}

/** Evaluate `&name`: a pointer to the variable's value (pointers may nest). */
function evalAddressOf(
  value: Extract<Value, { kind: "addressOf" }>,
  scopes: Scopes,
): Result<TypedValue, EvalError> {
  const target = valueToTyped(value.target, scopes);
  if (!target.ok) {
    return target;
  }
  if (value.target.kind !== "ident") {
    return err({
      kind: "TypeMismatch",
      name: "&",
      expected: "number",
      actual: typeToString(target.value),
      position: value.position,
    });
  }
  const variable = lookup(scopes, value.target.name);
  if (!variable) {
    return err({ kind: "UnknownIdentifier", name: value.target.name, position: value.position });
  }
  return ok({
    kind: "ptr",
    mutable: value.mutable,
    pointee: variable.value,
    ref: variable,
  });
}

/** Evaluate `*ptr`: the value a pointer refers to. */
function evalDeref(
  value: Extract<Value, { kind: "deref" }>,
  scopes: Scopes,
): Result<TypedValue, EvalError> {
  const target = valueToTyped(value.target, scopes);
  if (!target.ok) {
    return target;
  }
  if (!isPointer(target.value)) {
    return err({
      kind: "TypeMismatch",
      name: "*",
      expected: "ptr<number>",
      actual: typeToString(target.value),
      position: value.position,
    });
  }
  return ok(target.value.ref.value);
}

/**
 * Evaluate a value expression to a typed value, or an error for undeclared
 * identifiers. `==`/`!=` compare type-strictly: a bool and a number are never
 * equal. Ordering operators (`<`, `<=`, `>`, `>=`) compare numerically, with
 * bools coerced to 1/0.
 */
export function valueToTyped(value: Value, scopes: Scopes): Result<TypedValue, EvalError> {
  if (value.kind === "number") {
    return ok({ kind: "number", value: value.value });
  }
  if (value.kind === "bool") {
    return ok({ kind: "bool", value: value.value });
  }
  if (value.kind === "binary") {
    return evalBinary(value, scopes);
  }
  if (value.kind === "array") {
    return evalArray(value, scopes);
  }
  if (value.kind === "index") {
    return evalIndex(value, scopes);
  }
  if (value.kind === "addressOf") {
    return evalAddressOf(value, scopes);
  }
  if (value.kind === "deref") {
    return evalDeref(value, scopes);
  }
  const variable = lookup(scopes, value.name);
  if (!variable) {
    return err({ kind: "UnknownIdentifier", name: value.name, position: value.position });
  }
  return ok(variable.value);
}

/** Convert a value expression to a number, or an error for undeclared identifiers. */
export function valueToNumber(value: Value, scopes: Scopes): Result<number, EvalError> {
  const typed = valueToTyped(value, scopes);
  if (!typed.ok) {
    return typed;
  }
  if (isPointer(typed.value) || isArray(typed.value)) {
    return err({
      kind: "TypeMismatch",
      name: "*",
      expected: "number",
      actual: typeToString(typed.value),
      position: value.position,
    });
  }
  return ok(typed.value.kind === "bool" ? (typed.value.value ? 1 : 0) : typed.value.value);
}
