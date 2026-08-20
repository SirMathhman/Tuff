import type { ValueArray, ValueBinary, ValueIndex } from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import {
  INT_ANY,
  isUnsignedInt,
  promote,
  typeToString,
  type DeclScopes,
  type Type,
} from "./types.js";
import { comparableTypes, type BlockChecker, type CheckExpressionFn } from "./checkPredicates.js";

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
    // Arithmetic addition: both operands must be integers or floats; the
    // result is the promoted type of the two operands.
    const leftType = left.value;
    const rightType = right.value;
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
  if (value.operator === "==" || value.operator === "!=") {
    // Equality is subtype-aware: `1 == 1U8` compares an `Int` against a
    // `u8` (the `u8` is a subtype of `Int`).
    if (!comparableTypes(left.value, right.value)) {
      return err({
        kind: "TypeMismatch",
        name: value.operator,
        expected: typeToString(left.value),
        actual: typeToString(right.value),
        position: value.position,
      });
    }
  } else {
    // Ordering operators compare numerically; bools, integers, and floats
    // coerce.
    for (const operand of [left.value, right.value]) {
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
  }
  // Comparisons yield a `Bool`.
  return ok({ kind: "bool" });
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
  const validIndex =
    indexType.kind === "int" && (indexType.name === INT_ANY || isUnsignedInt(indexType.name));
  if (!validIndex) {
    return err({
      kind: "TypeMismatch",
      name: "[",
      expected: "usize",
      actual: typeToString(indexType),
      position: value.index.position,
    });
  }
  return ok(targetType.element);
}
