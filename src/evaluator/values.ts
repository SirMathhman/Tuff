import type {
  Value,
  ValueAddressOf,
  ValueBlock,
  ValueDeref,
  ValueIdent,
  ValueIf,
  ValueIs,
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
  typeFromName,
  typeToString,
  type TypeFloat,
  type TypeInt,
} from "./types.js";
import { isArray, isPointer, isRange, type Scopes, type TypedValue } from "./typedValues.js";
import { evalArray, evalBinary, evalIndex } from "./evalBinaryOps.js";
import {
  typeOfValue,
  type ValueContext,
  type ValueToNumberFn,
  type ValueToTypedFn,
} from "./valueHelpers.js";

// Re-exported so the statement and assignment evaluators can import the value
// context from the value evaluator (their existing import site).
export type { ValueContext };

/**
 * Evaluate a pointer operation: `&name` (a pointer to a variable's value,
 * pointers may nest) or `*ptr` (the value a pointer refers to).
 */
function evalPointerOp(
  value: ValueAddressOf | ValueDeref,
  scopes: Scopes,
  ctx: ValueContext,
  toTyped: ValueToTypedFn,
): Result<TypedValue, EvalError> {
  const target = toTyped(value.target, scopes, ctx);
  if (!target.ok) {
    return target;
  }
  if (value.kind === "addressOf") {
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
  toTyped: ValueToTypedFn,
  toNumber: ValueToNumberFn,
): Result<TypedValue, EvalError> {
  const startTyped = toTyped(value.start, scopes, ctx);
  if (!startTyped.ok) {
    return startTyped;
  }
  const start = toNumber(value.start, scopes, ctx, "..");
  if (!start.ok) {
    return start;
  }
  const end = toNumber(value.end, scopes, ctx, "..");
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
function evalIf(
  value: ValueIf,
  scopes: Scopes,
  ctx: ValueContext,
  toTyped: ValueToTypedFn,
  toNumber: ValueToNumberFn,
): Result<TypedValue, EvalError> {
  const condition = toNumber(value.condition, scopes, ctx, "if");
  if (!condition.ok) {
    return condition;
  }
  return toTyped(condition.value !== 0 ? value.then : value.else, scopes, ctx);
}

/** Evaluate a `match` expression: the value of the first arm whose pattern matches. */
function evalMatch(
  value: ValueMatch,
  scopes: Scopes,
  ctx: ValueContext,
  toTyped: ValueToTypedFn,
  toNumber: ValueToNumberFn,
): Result<TypedValue, EvalError> {
  const scrutinee = toNumber(value.scrutinee, scopes, ctx, "match");
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
      return toTyped(arm.value, scopes, ctx);
    }
  }
  // The typecheck pass requires a `_` arm, so this is unreachable; the
  // fallback is defensive.
  return err({ kind: "MissingWildcardArm", position: value.position });
}

/** Evaluate an `is` type-test: `true` when the operand's type is a subtype of the named type, else `false`. */
function evalIs(
  value: ValueIs,
  scopes: Scopes,
  ctx: ValueContext,
  toTyped: ValueToTypedFn,
): Result<TypedValue, EvalError> {
  const operand = toTyped(value.operand, scopes, ctx);
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

/** A numeric literal's payload (value and optional type suffix). */
interface NumberLiteral {
  value: number;
  suffix?: string;
}

/** The static `Type` of a numeric literal (suffixed or the family supertype). */
function numberLiteralType(value: NumberLiteral): TypeInt | TypeFloat {
  if (value.suffix) {
    return INT_BOUNDS[value.suffix]
      ? { kind: "int", name: value.suffix }
      : { kind: "float", name: value.suffix };
  }
  // Unsuffixed literals are the family supertypes: integer literals are
  // `Int`, fractional literals are `Float`.
  return Number.isInteger(value.value)
    ? { kind: "int", name: INT_ANY }
    : { kind: "float", name: FLOAT_ANY };
}

/** The compound value kinds handled by {@link evalCompoundValue}. */
type CompoundValue = ValueRange | ValueIf | ValueMatch | ValueBlock | ValueIdent;

/** Evaluate the compound value kinds: `range`, `if`, `match`, `block`, and identifiers. */
function evalCompoundValue(
  value: CompoundValue,
  scopes: Scopes,
  ctx: ValueContext,
): Result<TypedValue, EvalError> {
  if (value.kind === "range") {
    return evalRange(value, scopes, ctx, valueToTyped, valueToNumber);
  }
  if (value.kind === "if") {
    return evalIf(value, scopes, ctx, valueToTyped, valueToNumber);
  }
  if (value.kind === "match") {
    return evalMatch(value, scopes, ctx, valueToTyped, valueToNumber);
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
    const type = numberLiteralType(value);
    if (type.kind === "int") {
      return ok({ kind: "int", name: type.name, value: value.value });
    }
    return ok({ kind: "float", name: type.name, value: value.value });
  }
  if (value.kind === "bool") {
    return ok({ kind: "bool", value: value.value });
  }
  if (value.kind === "binary") {
    return evalBinary(value, scopes, ctx, valueToTyped);
  }
  if (value.kind === "is") {
    return evalIs(value, scopes, ctx, valueToTyped);
  }
  if (value.kind === "array") {
    return evalArray(value, scopes, ctx, valueToTyped);
  }
  if (value.kind === "index") {
    return evalIndex(value, scopes, ctx, valueToTyped, valueToNumber);
  }
  if (value.kind === "addressOf" || value.kind === "deref") {
    return evalPointerOp(value, scopes, ctx, valueToTyped);
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
  return evalCompoundValue(value, scopes, ctx);
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
