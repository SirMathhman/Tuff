import type { ValueArray, ValueBinary, ValueIndex } from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { INT_ANY, promote, typeToString, type DeclScopes, type Type } from "./types.js";
import {
  checkIndexType,
  comparableTypes,
  type BlockChecker,
  type CheckExpressionFn,
} from "./checkPredicates.js";

/** Check `a + b`: both operands numeric, result the promoted type. */
function checkAddition(
  value: ValueBinary,
  leftType: Type,
  rightType: Type,
): Result<Type, EvalError> {
  // Arithmetic addition: both operands must be integers or floats; the
  // result is the promoted type of the two operands.
  const conforms = (t: Type): boolean => t.kind === "int" || t.kind === "float";
  if (!conforms(leftType) || !conforms(rightType)) {
    const offending = !conforms(leftType) ? leftType : rightType;
    return err({
      kind: "TypeMismatch",
      name: value.operator,
      expected: "number",
      actual: typeToString(offending),
      position: value.position,
    });
  }
  const promoted = promote(leftType, rightType);
  if (!promoted) {
    // No concrete type can hold both operands (e.g. `u64 + i64`).
    return err({
      kind: "TypeMismatch",
      name: value.operator,
      expected: typeToString(leftType),
      actual: typeToString(rightType),
      position: value.position,
    });
  }
  return ok(promoted);
}

/** Check a comparison (`==`, `!=`, ordering): operands comparable, result `Bool`. */
function checkComparison(
  value: ValueBinary,
  leftType: Type,
  rightType: Type,
): Result<Type, EvalError> {
  if (value.operator === "==" || value.operator === "!=") {
    // Equality is subtype-aware: `1 == 1U8` compares an `Int` against a
    // `u8` (the `u8` is a subtype of `Int`).
    if (!comparableTypes(leftType, rightType)) {
      return err({
        kind: "TypeMismatch",
        name: value.operator,
        expected: typeToString(leftType),
        actual: typeToString(rightType),
        position: value.position,
      });
    }
    return ok({ kind: "bool" });
  }
  // Ordering operators compare numerically; bools, integers, and floats
  // coerce.
  for (const operand of [leftType, rightType]) {
    if (operand.kind !== "bool" && operand.kind !== "int" && operand.kind !== "float") {
      return err({
        kind: "TypeMismatch",
        name: value.operator,
        expected: "number",
        actual: typeToString(operand),
        position: value.position,
      });
    }
  }
  return ok({ kind: "bool" });
}

/** Check a binary operation's operands: identifiers declared, and no pointer operands to ordering operators. */
export function checkBinary(
  value: ValueBinary,
  scopes: DeclScopes,
  block: BlockChecker,
  check: CheckExpressionFn,
): Result<Type, EvalError> {
  const left = check(value.left, scopes, block);
  if (!left.ok) {
    return left;
  }
  const right = check(value.right, scopes, block);
  if (!right.ok) {
    return right;
  }
  if (value.operator === "+") {
    return checkAddition(value, left.value, right.value);
  }
  return checkComparison(value, left.value, right.value);
}

/** Check an array literal: every element is declared and all share one type. */
export function checkArray(
  value: ValueArray,
  scopes: DeclScopes,
  block: BlockChecker,
  check: CheckExpressionFn,
): Result<Type, EvalError> {
  const elementTypes: Type[] = [];
  for (const element of value.elements) {
    const result = check(element, scopes, block);
    if (!result.ok) {
      return result;
    }
    elementTypes.push(result.value);
  }
  const first = elementTypes[0];
  if (first) {
    for (let i = 1; i < elementTypes.length; i++) {
      // Elements must be mutually comparable (one a subtype of the other), so
      // `[1, 1U8]` is an `Int` array but `[1U8, 1I32]` is not.
      if (!comparableTypes(elementTypes[i], first)) {
        return err({
          kind: "TypeMismatch",
          name: "[",
          expected: typeToString(first),
          actual: typeToString(elementTypes[i]),
          position: value.elements[i].position,
        });
      }
    }
  }
  return ok({ kind: "array", element: first ?? { kind: "int", name: INT_ANY } });
}

/** Check an index expression: the target is an array and the index is `Int` or an unsigned integer. */
export function checkIndex(
  value: ValueIndex,
  scopes: DeclScopes,
  block: BlockChecker,
  check: CheckExpressionFn,
): Result<Type, EvalError> {
  const target = check(value.target, scopes, block);
  if (!target.ok) {
    return target;
  }
  const index = check(value.index, scopes, block);
  if (!index.ok) {
    return index;
  }
  const targetType = target.value;
  if (targetType.kind !== "array") {
    return err({
      kind: "TypeMismatch",
      name: "[",
      expected: "array<number>",
      actual: typeToString(targetType),
      position: value.position,
    });
  }
  const indexType = index.value;
  const validIndex = checkIndexType(indexType, value.index.position);
  if (!validIndex.ok) {
    return validIndex;
  }
  return ok(targetType.element);
}
