import type { ValueArray, ValueBinary, ValueIndex } from "../core/ast.js";
import { type EvalError, type Result, err, ok } from "../core/errors.js";
import { isSubtype, promote, typeToString, type Type } from "./types.js";
import {
  isArray,
  type Scopes,
  type TypedValue,
  type TypedValueFloat,
  type TypedValueInt,
} from "./typedValues.js";
import {
  typeOfValue,
  type ValueContext,
  type ValueToNumberFn,
  type ValueToTypedFn,
} from "./valueHelpers.js";

/** Evaluate a binary operation: `==`/`!=` compare subtype-aware; ordering operators compare numerically. All yield a `Bool`. */
export function evalBinary(
  value: ValueBinary,
  scopes: Scopes,
  ctx: ValueContext,
  toTyped: ValueToTypedFn,
): Result<TypedValue, EvalError> {
  const left = toTyped(value.left, scopes, ctx);
  if (!left.ok) {
    return left;
  }
  const right = toTyped(value.right, scopes, ctx);
  if (!right.ok) {
    return right;
  }
  if (value.operator === "+") {
    return evalAddition(value, left.value, right.value);
  }
  if (value.operator === "==" || value.operator === "!=") {
    const l = left.value;
    const r = right.value;
    // The typecheck pass guarantees the operand types are comparable; this is
    // a defensive fallback for incomparable types.
    const comparable =
      (l.kind === "bool" && r.kind === "bool") ||
      ((l.kind === "int" || l.kind === "float") &&
        (r.kind === "int" || r.kind === "float") &&
        (isSubtype(typeOfValue(l), typeOfValue(r)) || isSubtype(typeOfValue(r), typeOfValue(l))));
    if (!comparable) {
      return err({
        kind: "TypeMismatch",
        name: value.operator,
        expected: typeToString(typeOfValue(l)),
        actual: typeToString(typeOfValue(r)),
        position: value.position,
      });
    }
    const equal = l.kind === r.kind && l.value === r.value;
    const result = value.operator === "==" ? equal : !equal;
    return ok({ kind: "bool", value: result });
  }
  return evalOrdering(value, left.value, right.value);
}

/** Evaluate an ordering comparison (`<`, `<=`, `>`, `>=`) numerically. */
function evalOrdering(
  value: ValueBinary,
  l: TypedValue,
  r: TypedValue,
): Result<TypedValue, EvalError> {
  // The typecheck pass guarantees numeric operands; this is a defensive
  // fallback for a non-numeric operand reaching the evaluator.
  const toNum = (t: TypedValue): Result<number, EvalError> => {
    if (t.kind === "number" || t.kind === "int" || t.kind === "float") {
      return ok(t.value);
    }
    if (t.kind === "bool") {
      return ok(t.value ? 1 : 0);
    }
    return err({
      kind: "TypeMismatch",
      name: value.operator,
      expected: "number",
      actual: typeToString(typeOfValue(t)),
      position: value.position,
    });
  };
  const a = toNum(l);
  if (!a.ok) {
    return a;
  }
  const b = toNum(r);
  if (!b.ok) {
    return b;
  }
  let result: boolean;
  switch (value.operator) {
    case "<":
      result = a.value < b.value;
      break;
    case "<=":
      result = a.value <= b.value;
      break;
    case ">":
      result = a.value > b.value;
      break;
    case ">=":
      result = a.value >= b.value;
      break;
    default:
      // The typecheck pass guarantees a known ordering operator; this is a
      // defensive fallback for an unknown operator reaching the evaluator.
      return err({
        kind: "TypeMismatch",
        name: value.operator,
        expected: "ordering operator",
        actual: value.operator,
        position: value.position,
      });
  }
  return ok({ kind: "bool", value: result });
}

/** Evaluate `+` with type promotion: the result type is the LUB of the operand types. */
function evalAddition(
  value: ValueBinary,
  l: TypedValue,
  r: TypedValue,
): Result<TypedValue, EvalError> {
  const numeric = (t: TypedValue): t is TypedValueInt | TypedValueFloat =>
    t.kind === "int" || t.kind === "float";
  if (!numeric(l) || !numeric(r)) {
    // The typecheck pass rejects non-numeric operands; this is a defensive
    // fallback.
    return err({
      kind: "TypeMismatch",
      name: value.operator,
      expected: "number",
      actual: typeToString(typeOfValue(l)),
      position: value.position,
    });
  }
  const leftType: Type =
    l.kind === "int" ? { kind: "int", name: l.name } : { kind: "float", name: l.name };
  const rightType: Type =
    r.kind === "int" ? { kind: "int", name: r.name } : { kind: "float", name: r.name };
  const promoted = promote(leftType, rightType);
  if (promoted === undefined) {
    // The typecheck pass rejects operand pairs with no LUB; this is a
    // defensive fallback.
    return err({
      kind: "TypeMismatch",
      name: value.operator,
      expected: typeToString(leftType),
      actual: typeToString(rightType),
      position: value.position,
    });
  }
  const sum = l.value + r.value;
  if (promoted.kind === "int") {
    return ok({ kind: "int", name: promoted.name, value: sum });
  }
  if (promoted.kind === "float") {
    return ok({ kind: "float", name: promoted.name, value: sum });
  }
  // Defensive: promote() only yields int or float.
  return err({
    kind: "TypeMismatch",
    name: value.operator,
    expected: "number",
    actual: typeToString(promoted),
    position: value.position,
  });
}

/** Evaluate an array literal: elements must share a comparable type. */
export function evalArray(
  value: ValueArray,
  scopes: Scopes,
  ctx: ValueContext,
  toTyped: ValueToTypedFn,
): Result<TypedValue, EvalError> {
  const elements: TypedValue[] = [];
  for (const element of value.elements) {
    const result = toTyped(element, scopes, ctx);
    if (!result.ok) {
      return result;
    }
    elements.push(result.value);
  }
  // The typecheck pass guarantees the elements are comparable; the element
  // type is the type of the first element (or `number` for an empty array).
  const first = elements[0];
  const element: Type = first !== undefined ? typeOfValue(first) : { kind: "number" };
  return ok({ kind: "array", element, elements });
}

/** Evaluate an index expression: the index must be an integer. */
export function evalIndex(
  value: ValueIndex,
  scopes: Scopes,
  ctx: ValueContext,
  toTyped: ValueToTypedFn,
  toNumber: ValueToNumberFn,
): Result<TypedValue, EvalError> {
  const target = toTyped(value.target, scopes, ctx);
  if (!target.ok) {
    return target;
  }
  const index = toNumber(value.index, scopes, ctx, "[");
  if (!index.ok) {
    return index;
  }
  if (!isArray(target.value)) {
    // The typecheck pass rejects non-array targets; this is a defensive
    // fallback.
    return err({
      kind: "TypeMismatch",
      name: "[",
      expected: "array<number>",
      actual: typeToString(typeOfValue(target.value)),
      position: value.position,
    });
  }
  const i = index.value;
  if (i < 0 || i >= target.value.elements.length) {
    return err({
      kind: "IndexOutOfBounds",
      index: i,
      length: target.value.elements.length,
      position: value.position,
    });
  }
  return ok(target.value.elements[i]);
}
