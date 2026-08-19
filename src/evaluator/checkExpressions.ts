import type { Value } from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { lookup } from "../core/scopes.js";
import { expressionType, typeToString, typesEqual, type DeclScopes } from "./types.js";

/** Check a binary operation's operands: identifiers declared, and no pointer operands to ordering operators. */
function checkBinary(
  value: Extract<Value, { kind: "binary" }>,
  scopes: DeclScopes,
): Result<null, EvalError> {
  const left = checkExpression(value.left, scopes);
  if (!left.ok) {
    return left;
  }
  const right = checkExpression(value.right, scopes);
  if (!right.ok) {
    return right;
  }
  if (value.operator === "+") {
    // Arithmetic addition: both operands must be numbers.
    for (const operand of [value.left, value.right]) {
      const type = expressionType(operand, scopes);
      if (type.kind !== "number") {
        return err({
          kind: "TypeMismatch",
          name: value.operator,
          expected: "number",
          actual: typeToString(type),
          position: value.position,
        });
      }
    }
    return ok(null);
  }
  if (value.operator !== "==" && value.operator !== "!=") {
    // Ordering operators compare numerically; pointers have no numeric value.
    for (const operand of [value.left, value.right]) {
      const type = expressionType(operand, scopes);
      if (type.kind === "ptr") {
        return err({
          kind: "TypeMismatch",
          name: value.operator,
          expected: "number",
          actual: typeToString(type),
          position: value.position,
        });
      }
    }
  }
  return ok(null);
}

/** Check an array literal: every element is declared and all share one type. */
function checkArray(
  value: Extract<Value, { kind: "array" }>,
  scopes: DeclScopes,
): Result<null, EvalError> {
  for (const element of value.elements) {
    const result = checkExpression(element, scopes);
    if (!result.ok) {
      return result;
    }
  }
  const first = value.elements[0];
  if (first) {
    const elementType = expressionType(first, scopes);
    for (const element of value.elements.slice(1)) {
      if (!typesEqual(expressionType(element, scopes), elementType)) {
        return err({
          kind: "TypeMismatch",
          name: "[",
          expected: typeToString(elementType),
          actual: typeToString(expressionType(element, scopes)),
          position: element.position,
        });
      }
    }
  }
  return ok(null);
}

/** Check an index expression: the target is an array and the index is a number. */
function checkIndex(
  value: Extract<Value, { kind: "index" }>,
  scopes: DeclScopes,
): Result<null, EvalError> {
  const target = checkExpression(value.target, scopes);
  if (!target.ok) {
    return target;
  }
  const index = checkExpression(value.index, scopes);
  if (!index.ok) {
    return index;
  }
  const targetType = expressionType(value.target, scopes);
  if (targetType.kind !== "array") {
    return err({
      kind: "TypeMismatch",
      name: "[",
      expected: "array<number>",
      actual: typeToString(targetType),
      position: value.position,
    });
  }
  const indexType = expressionType(value.index, scopes);
  if (indexType.kind !== "number") {
    return err({
      kind: "TypeMismatch",
      name: "[",
      expected: "number",
      actual: typeToString(indexType),
      position: value.index.position,
    });
  }
  return ok(null);
}

/**
 * Check that every identifier in a value expression is declared in the current
 * scope stack. Returns an `UnknownIdentifier` error for the first undeclared
 * reference found.
 */
export function checkExpression(value: Value, scopes: DeclScopes): Result<null, EvalError> {
  if (value.kind === "ident") {
    if (!lookup(scopes, value.name)) {
      return err({ kind: "UnknownIdentifier", name: value.name, position: value.position });
    }
    return ok(null);
  }
  if (value.kind === "binary") {
    return checkBinary(value, scopes);
  }
  if (value.kind === "array") {
    return checkArray(value, scopes);
  }
  if (value.kind === "index") {
    return checkIndex(value, scopes);
  }
  if (value.kind === "addressOf") {
    if (value.target.kind !== "ident") {
      return err({
        kind: "TypeMismatch",
        name: "&",
        expected: "number",
        actual: typeToString(expressionType(value.target, scopes)),
        position: value.position,
      });
    }
    return checkExpression(value.target, scopes);
  }
  if (value.kind === "deref") {
    const target = checkExpression(value.target, scopes);
    if (!target.ok) {
      return target;
    }
    const targetType = expressionType(value.target, scopes);
    if (targetType.kind !== "ptr") {
      return err({
        kind: "TypeMismatch",
        name: "*",
        expected: "ptr<number>",
        actual: typeToString(targetType),
        position: value.position,
      });
    }
    return ok(null);
  }
  return ok(null);
}
