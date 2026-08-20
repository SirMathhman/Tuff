import type {
  MatchPatternNumber,
  ValueAddressOf,
  ValueDeref,
  ValueIf,
  ValueIs,
  ValueMatch,
  ValueRange,
} from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import {
  FLOAT_ANY,
  INT_ANY,
  INT_BOUNDS,
  typeFromName,
  typeToString,
  typesEqual,
  type DeclScopes,
  type Type,
} from "./types.js";
import {
  checkBool,
  checkNumericCoercible,
  comparableTypes,
  type BlockChecker,
  type CheckExpressionFn,
} from "./checkPredicates.js";

/** Check a `*ptr` dereference: the target must be a pointer. */
export function checkDeref(
  value: ValueDeref,
  scopes: DeclScopes,
  block: BlockChecker,
  check: CheckExpressionFn,
): Result<Type, EvalError> {
  const target = check(value.target, scopes, block);
  if (!target.ok) {
    return target;
  }
  const targetType = target.value;
  if (targetType.kind !== "ptr") {
    return err({
      kind: "TypeMismatch",
      name: "*",
      expected: "ptr<number>",
      actual: typeToString(targetType),
      position: value.position,
    });
  }
  return ok(targetType.pointee);
}

/** Check a `start..end` range: both bounds are declared and numeric-coercible. */
export function checkRange(
  value: ValueRange,
  scopes: DeclScopes,
  block: BlockChecker,
  check: CheckExpressionFn,
): Result<Type, EvalError> {
  const start = check(value.start, scopes, block);
  if (!start.ok) {
    return start;
  }
  const end = check(value.end, scopes, block);
  if (!end.ok) {
    return end;
  }
  // Bounds must be numeric-coercible so the evaluator never has to emit a
  // placeholder error for a `..` construct the user did not write.
  const startCoercible = checkNumericCoercible(start.value, "..", value.start.position);
  if (!startCoercible.ok) {
    return startCoercible;
  }
  const endCoercible = checkNumericCoercible(end.value, "..", value.end.position);
  if (!endCoercible.ok) {
    return endCoercible;
  }
  return ok({ kind: "range", element: start.value });
}

/**
 * Check an `if` expression: the condition is declared and numeric-coercible,
 * both branches are declared, and the branches share one type.
 */
export function checkIf(
  value: ValueIf,
  scopes: DeclScopes,
  block: BlockChecker,
  check: CheckExpressionFn,
): Result<Type, EvalError> {
  const condition = check(value.condition, scopes, block);
  if (!condition.ok) {
    return condition;
  }
  const then = check(value.then, scopes, block);
  if (!then.ok) {
    return then;
  }
  const elseBranch = check(value.else, scopes, block);
  if (!elseBranch.ok) {
    return elseBranch;
  }
  // The condition must be a `Bool`.
  const conditionBool = checkBool(condition.value, "if", value.condition.position);
  if (!conditionBool.ok) {
    return conditionBool;
  }
  const thenType = then.value;
  const elseType = elseBranch.value;
  if (!typesEqual(thenType, elseType)) {
    return err({
      kind: "TypeMismatch",
      name: "if",
      expected: typeToString(thenType),
      actual: typeToString(elseType),
      position: value.position,
    });
  }
  return ok(thenType);
}

/**
 * The static type of a number-literal `match` pattern: its suffixed type when
 * suffixed, else the unsuffixed-literal type (`Int` for integers, `Float` for
 * fractionals).
 */
function numberPatternType(pattern: MatchPatternNumber): Type {
  if (pattern.suffix) {
    return INT_BOUNDS[pattern.suffix]
      ? { kind: "int", name: pattern.suffix }
      : { kind: "float", name: pattern.suffix };
  }
  return Number.isInteger(pattern.value)
    ? { kind: "int", name: INT_ANY }
    : { kind: "float", name: FLOAT_ANY };
}

/**
 * Check a `match` expression: the scrutinee is declared and numeric-coercible,
 * every arm's pattern type matches the scrutinee's, all arm values share one
 * type, and a `_` wildcard arm is present (so the expression is total).
 */
export function checkMatch(
  value: ValueMatch,
  scopes: DeclScopes,
  block: BlockChecker,
  check: CheckExpressionFn,
): Result<Type, EvalError> {
  const scrutinee = check(value.scrutinee, scopes, block);
  if (!scrutinee.ok) {
    return scrutinee;
  }
  const scrutineeCoercible = checkNumericCoercible(
    scrutinee.value,
    "match",
    value.scrutinee.position,
  );
  if (!scrutineeCoercible.ok) {
    return scrutineeCoercible;
  }
  const scrutineeStatic = scrutinee.value;
  let armType: Type | undefined;
  for (const arm of value.arms) {
    if (arm.pattern.kind !== "wildcard") {
      const patternType: Type =
        arm.pattern.kind === "number" ? numberPatternType(arm.pattern) : { kind: "bool" };
      // The pattern type must be comparable with the scrutinee's type in
      // either direction (one a subtype of the other).
      if (!comparableTypes(patternType, scrutineeStatic)) {
        return err({
          kind: "TypeMismatch",
          name: "case",
          expected: typeToString(scrutineeStatic),
          actual: typeToString(patternType),
          position: arm.pattern.position,
        });
      }
    }
    const checked = check(arm.value, scopes, block);
    if (!checked.ok) {
      return checked;
    }
    const armValue = checked.value;
    if (armType && !typesEqual(armType, armValue)) {
      return err({
        kind: "TypeMismatch",
        name: "match",
        expected: typeToString(armType),
        actual: typeToString(armValue),
        position: arm.position,
      });
    }
    armType = armValue;
  }
  if (!value.arms.some((arm) => arm.pattern.kind === "wildcard")) {
    return err({ kind: "MissingWildcardArm", position: value.position });
  }
  return ok(armType ?? { kind: "int", name: INT_ANY });
}

/** Check an `is` type-test: the operand is declared and the type name resolves. */
export function checkIs(
  value: ValueIs,
  scopes: DeclScopes,
  block: BlockChecker,
  check: CheckExpressionFn,
): Result<Type, EvalError> {
  const operand = check(value.operand, scopes, block);
  if (!operand.ok) {
    return operand;
  }
  if (!typeFromName(value.type)) {
    return err({ kind: "UnknownType", name: value.type, position: value.position });
  }
  return ok({ kind: "bool" });
}

/** Check a `&name` address-of: the target must be a declared variable. */
export function checkAddressOf(
  value: ValueAddressOf,
  scopes: DeclScopes,
  block: BlockChecker,
  check: CheckExpressionFn,
): Result<Type, EvalError> {
  if (value.target.kind !== "ident") {
    const target = check(value.target, scopes, block);
    if (!target.ok) {
      return target;
    }
    return err({
      kind: "TypeMismatch",
      name: "&",
      expected: "variable",
      actual: typeToString(target.value),
      position: value.position,
    });
  }
  const target = check(value.target, scopes, block);
  if (!target.ok) {
    return target;
  }
  return ok({ kind: "ptr", mutable: value.mutable, pointee: target.value });
}
