import type {
  Statement,
  Value,
  ValueArray,
  ValueBinary,
  ValueDeref,
  ValueIf,
  ValueIndex,
  ValueRange,
} from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { lookup } from "../core/scopes.js";
import { expressionType, typeToString, typesEqual, type DeclScopes } from "./types.js";

/**
 * A block-statement checker, threaded through the expression checker as an
 * explicit dependency. Block values and statements mutually recurse (a block
 * value's statements are checked by the statement checker), so the typechecker
 * passes its checker in here rather than importing it (module cycle).
 */
export type BlockChecker = (statements: Statement[], scopes: DeclScopes) => Result<null, EvalError>;

/** Check a binary operation's operands: identifiers declared, and no pointer operands to ordering operators. */
function checkBinary(
  value: ValueBinary,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<null, EvalError> {
  const left = checkExpression(value.left, scopes, block);
  if (!left.ok) {
    return left;
  }
  const right = checkExpression(value.right, scopes, block);
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
    // Ordering operators compare numerically; only numbers and bools coerce.
    for (const operand of [value.left, value.right]) {
      const type = expressionType(operand, scopes);
      if (type.kind !== "number" && type.kind !== "bool") {
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
  value: ValueArray,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<null, EvalError> {
  for (const element of value.elements) {
    const result = checkExpression(element, scopes, block);
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
  value: ValueIndex,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<null, EvalError> {
  const target = checkExpression(value.target, scopes, block);
  if (!target.ok) {
    return target;
  }
  const index = checkExpression(value.index, scopes, block);
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
 * Check that a value expression can coerce to a number (numbers and bools can;
 * arrays, pointers, and ranges cannot). Used for `return` values, `if`/`while`
 * conditions, and `..` range bounds, where the evaluator would otherwise emit
 * a placeholder error.
 */
export function checkNumericCoercible(
  value: Value,
  scopes: DeclScopes,
  name: string,
): Result<null, EvalError> {
  const type = expressionType(value, scopes);
  if (type.kind === "array" || type.kind === "ptr" || type.kind === "range") {
    return err({
      kind: "TypeMismatch",
      name,
      expected: "number",
      actual: typeToString(type),
      position: value.position,
    });
  }
  return ok(null);
}

/** Check a `*ptr` dereference: the target must be a pointer. */
function checkDeref(
  value: ValueDeref,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<null, EvalError> {
  const target = checkExpression(value.target, scopes, block);
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

/** Check a `start..end` range: both bounds are declared and numeric-coercible. */
function checkRange(
  value: ValueRange,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<null, EvalError> {
  const start = checkExpression(value.start, scopes, block);
  if (!start.ok) {
    return start;
  }
  const end = checkExpression(value.end, scopes, block);
  if (!end.ok) {
    return end;
  }
  // Bounds must be numeric-coercible so the evaluator never has to emit a
  // placeholder error for a `..` construct the user did not write.
  const startType = checkNumericCoercible(value.start, scopes, "..");
  if (!startType.ok) {
    return startType;
  }
  return checkNumericCoercible(value.end, scopes, "..");
}

/**
 * Check an `if` expression: the condition is declared and numeric-coercible,
 * both branches are declared, and the branches share one type.
 */
function checkIf(value: ValueIf, scopes: DeclScopes, block: BlockChecker): Result<null, EvalError> {
  const condition = checkExpression(value.condition, scopes, block);
  if (!condition.ok) {
    return condition;
  }
  const then = checkExpression(value.then, scopes, block);
  if (!then.ok) {
    return then;
  }
  const elseBranch = checkExpression(value.else, scopes, block);
  if (!elseBranch.ok) {
    return elseBranch;
  }
  const conditionType = checkNumericCoercible(value.condition, scopes, "if");
  if (!conditionType.ok) {
    return conditionType;
  }
  const thenType = expressionType(value.then, scopes);
  const elseType = expressionType(value.else, scopes);
  if (!typesEqual(thenType, elseType)) {
    return err({
      kind: "TypeMismatch",
      name: "if",
      expected: typeToString(thenType),
      actual: typeToString(elseType),
      position: value.position,
    });
  }
  return ok(null);
}

/**
 * Check that every identifier in a value expression is declared in the current
 * scope stack. Returns an `UnknownIdentifier` error for the first undeclared
 * reference found.
 */
export function checkExpression(
  value: Value,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<null, EvalError> {
  if (value.kind === "ident") {
    if (!lookup(scopes, value.name)) {
      return err({ kind: "UnknownIdentifier", name: value.name, position: value.position });
    }
    return ok(null);
  }
  if (value.kind === "binary") {
    return checkBinary(value, scopes, block);
  }
  if (value.kind === "array") {
    return checkArray(value, scopes, block);
  }
  if (value.kind === "index") {
    return checkIndex(value, scopes, block);
  }
  if (value.kind === "addressOf") {
    if (value.target.kind !== "ident") {
      return err({
        kind: "TypeMismatch",
        name: "&",
        expected: "variable",
        actual: typeToString(expressionType(value.target, scopes)),
        position: value.position,
      });
    }
    return checkExpression(value.target, scopes, block);
  }
  if (value.kind === "deref") {
    return checkDeref(value, scopes, block);
  }
  if (value.kind === "range") {
    return checkRange(value, scopes, block);
  }
  if (value.kind === "if") {
    return checkIf(value, scopes, block);
  }
  if (value.kind === "block") {
    return block(value.statements, scopes);
  }
  return ok(null);
}
