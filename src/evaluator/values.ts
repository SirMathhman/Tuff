import type {
  Value,
  ValueArray,
  ValueBinary,
  ValueBlock,
  ValueDeref,
  ValueIf,
  ValueIndex,
  ValueAddressOf,
  ValueMatch,
  ValueRange,
} from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { lookup } from "../core/scopes.js";
import { promote, typeToString, type Type } from "./types.js";
import {
  isArray,
  isPointer,
  isRange,
  type Scopes,
  type TypedValue,
  type TypedValueInt,
  type TypedValueNumber,
} from "./typedValues.js";

/**
 * A block-value evaluator, threaded through the value evaluator as an explicit
 * dependency. Block values and statements mutually recurse (a block value's
 * statements are evaluated by the statement evaluator), so the statement
 * evaluator passes its block-value evaluator in here rather than importing it
 * (module cycle).
 */
export type BlockValueEvaluator = (
  value: ValueBlock,
  scopes: Scopes,
) => Result<TypedValue, EvalError>;

/** The block-value evaluator, threaded through value evaluation. */
export interface ValueContext {
  evalBlock: BlockValueEvaluator;
}

/** Evaluate a binary operation: `==`/`!=` compare type-strictly; ordering operators compare numerically. */
function evalBinary(
  value: ValueBinary,
  scopes: Scopes,
  ctx: ValueContext,
): Result<TypedValue, EvalError> {
  const left = valueToTyped(value.left, scopes, ctx);
  if (!left.ok) {
    return left;
  }
  const right = valueToTyped(value.right, scopes, ctx);
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
    } else if (l.kind === "int" && r.kind === "int") {
      // Type-strict: integers compare equal only within the same type.
      equal = l.name === r.name && l.value === r.value;
    }
    const result = value.operator === "==" ? equal : !equal;
    return ok({ kind: "number", value: result ? 1 : 0 });
  }
  return evalOrdering(value, left.value, right.value);
}

/** Compare two typed values with an ordering operator; bools coerce to 1/0. */
function evalOrdering(
  value: ValueBinary,
  l: TypedValue,
  r: TypedValue,
): Result<TypedValue, EvalError> {
  // Pointers are rejected by the typecheck pass; this is a defensive fallback.
  const toNum = (t: TypedValue): Result<number, EvalError> => {
    if (t.kind === "number" || t.kind === "int") {
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

/** Evaluate `a + b`: numeric addition over numbers and integers. */
function evalAddition(
  value: ValueBinary,
  l: TypedValue,
  r: TypedValue,
): Result<TypedValue, EvalError> {
  // Operands are checked to be numbers or integers by the typecheck pass;
  // defensive fallback.
  const numeric = (t: TypedValue): t is TypedValueNumber | TypedValueInt =>
    t.kind === "number" || t.kind === "int";
  if (!numeric(l) || !numeric(r)) {
    return err({
      kind: "TypeMismatch",
      name: "+",
      expected: "number",
      actual: !numeric(l) ? typeToString(l) : typeToString(r),
      position: value.position,
    });
  }
  const sum = l.value + r.value;
  const result = promote(
    l.kind === "int" ? { kind: "int", name: l.name } : { kind: "number" },
    r.kind === "int" ? { kind: "int", name: r.name } : { kind: "number" },
  );
  return result.kind === "int" ? ok({ kind: "int", name: result.name, value: sum }) : ok({ kind: "number", value: sum });
}

/** Evaluate an array literal `[e1, e2, ...]` into a typed array value. */
function evalArray(
  value: ValueArray,
  scopes: Scopes,
  ctx: ValueContext,
): Result<TypedValue, EvalError> {
  const elements: TypedValue[] = [];
  for (const element of value.elements) {
    const typed = valueToTyped(element, scopes, ctx);
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
  value: ValueIndex,
  scopes: Scopes,
  ctx: ValueContext,
): Result<TypedValue, EvalError> {
  const target = valueToTyped(value.target, scopes, ctx);
  if (!target.ok) {
    return target;
  }
  const index = valueToNumber(value.index, scopes, ctx);
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
      kind: "IndexOutOfBounds",
      index: index.value,
      length: target.value.elements.length,
      position: value.position,
    });
  }
  return ok(element);
}

/** Evaluate `&name`: a pointer to the variable's value (pointers may nest). */
function evalAddressOf(
  value: ValueAddressOf,
  scopes: Scopes,
  ctx: ValueContext,
): Result<TypedValue, EvalError> {
  const target = valueToTyped(value.target, scopes, ctx);
  if (!target.ok) {
    return target;
  }
  if (value.target.kind !== "ident") {
    return err({
      kind: "TypeMismatch",
      name: "&",
      expected: "variable",
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
  value: ValueDeref,
  scopes: Scopes,
  ctx: ValueContext,
): Result<TypedValue, EvalError> {
  const target = valueToTyped(value.target, scopes, ctx);
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

/** Evaluate a `start..end` range into a typed range value (bounds are numbers). */
function evalRange(
  value: ValueRange,
  scopes: Scopes,
  ctx: ValueContext,
): Result<TypedValue, EvalError> {
  const start = valueToNumber(value.start, scopes, ctx);
  if (!start.ok) {
    return start;
  }
  const end = valueToNumber(value.end, scopes, ctx);
  if (!end.ok) {
    return end;
  }
  return ok({ kind: "range", element: { kind: "number" }, start: start.value, end: end.value });
}

/** Evaluate an `if` expression: the value of the branch its condition selects. */
function evalIf(value: ValueIf, scopes: Scopes, ctx: ValueContext): Result<TypedValue, EvalError> {
  const condition = valueToNumber(value.condition, scopes, ctx);
  if (!condition.ok) {
    return condition;
  }
  return valueToTyped(condition.value !== 0 ? value.then : value.else, scopes, ctx);
}

/** Evaluate a `match` expression: the value of the first arm whose pattern matches. */
function evalMatch(
  value: ValueMatch,
  scopes: Scopes,
  ctx: ValueContext,
): Result<TypedValue, EvalError> {
  const scrutinee = valueToNumber(value.scrutinee, scopes, ctx);
  if (!scrutinee.ok) {
    return scrutinee;
  }
  for (const arm of value.arms) {
    const pattern = arm.pattern;
    const matches =
      pattern.kind === "wildcard"
        ? true
        : pattern.kind === "number"
          ? scrutinee.value === pattern.value
          : scrutinee.value === (pattern.value ? 1 : 0);
    if (matches) {
      return valueToTyped(arm.value, scopes, ctx);
    }
  }
  // The typecheck pass requires a `_` arm, so this is unreachable; the
  // fallback is defensive.
  return err({ kind: "MissingWildcardArm", position: value.position });
}

/**
 * Evaluate a value expression to a typed value, or an error for undeclared
 * identifiers. `==`/`!=` compare type-strictly: a bool and a number are never
 * equal. Ordering operators (`<`, `<=`, `>`, `>=`) compare numerically, with
 * bools coerced to 1/0.
 */
export function valueToTyped(
  value: Value,
  scopes: Scopes,
  ctx: ValueContext,
): Result<TypedValue, EvalError> {
  if (value.kind === "number") {
    return value.suffix
      ? ok({ kind: "int", name: value.suffix, value: value.value })
      : ok({ kind: "number", value: value.value });
  }
  if (value.kind === "bool") {
    return ok({ kind: "bool", value: value.value });
  }
  if (value.kind === "binary") {
    return evalBinary(value, scopes, ctx);
  }
  if (value.kind === "array") {
    return evalArray(value, scopes, ctx);
  }
  if (value.kind === "index") {
    return evalIndex(value, scopes, ctx);
  }
  if (value.kind === "addressOf") {
    return evalAddressOf(value, scopes, ctx);
  }
  if (value.kind === "deref") {
    return evalDeref(value, scopes, ctx);
  }
  if (value.kind === "indexAssign") {
    // An lvalue is never read as a value; the typecheck pass rejects this.
    return err({
      kind: "TypeMismatch",
      name: "[",
      expected: "value",
      actual: "lvalue",
      position: value.position,
    });
  }
  if (value.kind === "range") {
    return evalRange(value, scopes, ctx);
  }
  if (value.kind === "if") {
    return evalIf(value, scopes, ctx);
  }
  if (value.kind === "match") {
    return evalMatch(value, scopes, ctx);
  }
  if (value.kind === "block") {
    return ctx.evalBlock(value, scopes);
  }
  const variable = lookup(scopes, value.name);
  if (!variable) {
    return err({ kind: "UnknownIdentifier", name: value.name, position: value.position });
  }
  return ok(variable.value);
}

/** Convert a value expression to a number, or an error for undeclared identifiers. */
export function valueToNumber(
  value: Value,
  scopes: Scopes,
  ctx: ValueContext,
): Result<number, EvalError> {
  const typed = valueToTyped(value, scopes, ctx);
  if (!typed.ok) {
    return typed;
  }
  if (isPointer(typed.value) || isArray(typed.value) || isRange(typed.value)) {
    return err({
      kind: "TypeMismatch",
      name: "*",
      expected: "number",
      actual: typeToString(typed.value),
      position: value.position,
    });
  }
  if (typed.value.kind === "bool") {
    return ok(typed.value.value ? 1 : 0);
  }
  return ok(typed.value.value);
}
