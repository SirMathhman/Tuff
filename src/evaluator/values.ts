import type {
  Value,
  ValueArray,
  ValueBinary,
  ValueBlock,
  ValueDeref,
  ValueIf,
  ValueIndex,
  ValueIs,
  ValueAddressOf,
  ValueMatch,
  ValueRange,
} from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { lookup } from "../core/scopes.js";
import {
  FLOAT_ANY,
  INT_ANY,
  INT_BOUNDS,
  isSubtype,
  promote,
  typeFromName,
  typeToString,
  type Type,
} from "./types.js";
import {
  isArray,
  isPointer,
  isRange,
  type Scopes,
  type TypedValue,
  type TypedValueFloat,
  type TypedValueInt,
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

/** Evaluate a binary operation: `==`/`!=` compare subtype-aware; ordering operators compare numerically. All yield a `Bool`. */
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

/** Compare two typed values with an ordering operator; bools coerce to 1/0. */
function evalOrdering(
  value: ValueBinary,
  l: TypedValue,
  r: TypedValue,
): Result<TypedValue, EvalError> {
  // Pointers are rejected by the typecheck pass; this is a defensive fallback.
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
  return ok({ kind: "bool", value: result });
}

/** Evaluate `a + b`: addition over integers and floats, typed by promotion. */
function evalAddition(
  value: ValueBinary,
  l: TypedValue,
  r: TypedValue,
): Result<TypedValue, EvalError> {
  // Operands are checked to be integers or floats by the typecheck pass;
  // defensive fallback.
  const numeric = (t: TypedValue): t is TypedValueInt | TypedValueFloat =>
    t.kind === "int" || t.kind === "float";
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
  const leftType: Type =
    l.kind === "int" ? { kind: "int", name: l.name } : { kind: "float", name: l.name };
  const rightType: Type =
    r.kind === "int" ? { kind: "int", name: r.name } : { kind: "float", name: r.name };
  const result = promote(leftType, rightType);
  // The typecheck pass guarantees a common type exists; defensive fallback.
  if (!result) {
    return err({
      kind: "TypeMismatch",
      name: "+",
      expected: typeToString(leftType),
      actual: typeToString(rightType),
      position: value.position,
    });
  }
  if (result.kind === "int") {
    return ok({ kind: "int", name: result.name, value: sum });
  }
  if (result.kind === "float") {
    return ok({ kind: "float", name: result.name, value: sum });
  }
  // Promotion of two numeric types is always int or float; defensive.
  return err({
    kind: "TypeMismatch",
    name: "+",
    expected: typeToString(leftType),
    actual: typeToString(rightType),
    position: value.position,
  });
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
  const index = valueToNumber(value.index, scopes, ctx, "[");
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

/** Evaluate a `start..end` range into a typed range value (bounds are numeric). */
function evalRange(
  value: ValueRange,
  scopes: Scopes,
  ctx: ValueContext,
): Result<TypedValue, EvalError> {
  const startTyped = valueToTyped(value.start, scopes, ctx);
  if (!startTyped.ok) {
    return startTyped;
  }
  const start = valueToNumber(value.start, scopes, ctx, "..");
  if (!start.ok) {
    return start;
  }
  const end = valueToNumber(value.end, scopes, ctx, "..");
  if (!end.ok) {
    return end;
  }
  return ok({
    kind: "range",
    element: typeOfValue(startTyped.value),
    start: start.value,
    end: end.value,
  });
}

/** Evaluate an `if` expression: the value of the branch its condition selects. */
function evalIf(value: ValueIf, scopes: Scopes, ctx: ValueContext): Result<TypedValue, EvalError> {
  const condition = valueToNumber(value.condition, scopes, ctx, "if");
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
  const scrutinee = valueToNumber(value.scrutinee, scopes, ctx, "match");
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

/** The static `Type` of a typed value (used by `is` type-tests and `+`). */
function typeOfValue(typed: TypedValue): Type {
  if (typed.kind === "number") {
    return { kind: "number" };
  }
  if (typed.kind === "bool") {
    return { kind: "bool" };
  }
  if (typed.kind === "int") {
    return { kind: "int", name: typed.name };
  }
  if (typed.kind === "float") {
    return { kind: "float", name: typed.name };
  }
  if (typed.kind === "array") {
    return { kind: "array", element: typed.element };
  }
  if (typed.kind === "ptr") {
    return { kind: "ptr", mutable: typed.mutable, pointee: typed.pointee };
  }
  return { kind: "range", element: typed.element };
}

/** Evaluate an `is` type-test: `true` when the operand's type is a subtype of the named type, else `false`. */
function evalIs(value: ValueIs, scopes: Scopes, ctx: ValueContext): Result<TypedValue, EvalError> {
  const operand = valueToTyped(value.operand, scopes, ctx);
  if (!operand.ok) {
    return operand;
  }
  const named = typeFromName(value.type);
  // The typecheck pass rejects unknown names; this is a defensive fallback.
  if (!named) {
    return err({ kind: "UnknownType", name: value.type, position: value.position });
  }
  const matches = isSubtype(typeOfValue(operand.value), named);
  return ok({ kind: "bool", value: matches });
}

/**
 * Evaluate a value expression to a typed value, or an error for undeclared
 * identifiers. `==`/`!=` compare subtype-aware: a `u8` and an `Int` compare
 * as numbers. Ordering operators (`<`, `<=`, `>`, `>=`) compare numerically,
 * with bools coerced to 1/0. All comparisons yield a `Bool`.
 */
export function valueToTyped(
  value: Value,
  scopes: Scopes,
  ctx: ValueContext,
): Result<TypedValue, EvalError> {
  if (value.kind === "number") {
    if (value.suffix) {
      return INT_BOUNDS[value.suffix]
        ? ok({ kind: "int", name: value.suffix, value: value.value })
        : ok({ kind: "float", name: value.suffix, value: value.value });
    }
    // Unsuffixed literals are the family supertypes: integer literals are
    // `Int`, fractional literals are `Float`.
    return Number.isInteger(value.value)
      ? ok({ kind: "int", name: INT_ANY, value: value.value })
      : ok({ kind: "float", name: FLOAT_ANY, value: value.value });
  }
  if (value.kind === "bool") {
    return ok({ kind: "bool", value: value.value });
  }
  if (value.kind === "binary") {
    return evalBinary(value, scopes, ctx);
  }
  if (value.kind === "is") {
    return evalIs(value, scopes, ctx);
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

/**
 * Convert a value expression to a number, or an error for undeclared
 * identifiers. `name` is the construct being coerced (e.g. `while`, `return`),
 * used in the defensive `TypeMismatch` payload so it names what the user wrote.
 */
export function valueToNumber(
  value: Value,
  scopes: Scopes,
  ctx: ValueContext,
  name: string,
): Result<number, EvalError> {
  const typed = valueToTyped(value, scopes, ctx);
  if (!typed.ok) {
    return typed;
  }
  if (isPointer(typed.value) || isArray(typed.value) || isRange(typed.value)) {
    return err({
      kind: "TypeMismatch",
      name,
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
