import type {
  Statement,
  Value,
  ValueArray,
  ValueBinary,
  ValueDeref,
  ValueIf,
  ValueIndex,
  ValueIs,
  ValueMatch,
  ValueRange,
} from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { lookup } from "../core/scopes.js";
import {
  intLiteralInRange,
  promote,
  typeFromName,
  typeToString,
  typesEqual,
  type DeclScopes,
  type Type,
} from "./types.js";

/**
 * A block-statement checker, threaded through the expression checker as an
 * explicit dependency. Block values and statements mutually recurse (a block
 * value's statements are checked by the statement checker), so the typechecker
 * passes its checker in here rather than importing it (module cycle). It
 * returns the block value's type (that of its final bare expression).
 */
export type BlockChecker = (statements: Statement[], scopes: DeclScopes) => Result<Type, EvalError>;

/** Check a binary operation's operands: identifiers declared, and no pointer operands to ordering operators. */
function checkBinary(
  value: ValueBinary,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<Type, EvalError> {
  const left = checkExpression(value.left, scopes, block);
  if (!left.ok) {
    return left;
  }
  const right = checkExpression(value.right, scopes, block);
  if (!right.ok) {
    return right;
  }
  if (value.operator === "+") {
    // Arithmetic addition: both operands must be numbers or integers; the
    // result is the promoted type of the two operands.
    const leftType = left.value;
    const rightType = right.value;
    const conforms = (t: Type): boolean => t.kind === "number" || t.kind === "int";
    if (!conforms(leftType) || !conforms(rightType)) {
      const promoted = promote(leftType, rightType);
      const offending = !conforms(leftType) ? leftType : rightType;
      return err({
        kind: "TypeMismatch",
        name: value.operator,
        expected: typeToString(promoted),
        actual: typeToString(offending),
        position: value.position,
      });
    }
    return ok(promote(leftType, rightType));
  }
  if (value.operator !== "==" && value.operator !== "!=") {
    // Ordering operators compare numerically; numbers, bools, and integers coerce.
    for (const operand of [left.value, right.value]) {
      if (operand.kind !== "number" && operand.kind !== "bool" && operand.kind !== "int") {
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
  return ok({ kind: "number" });
}

/** Check an array literal: every element is declared and all share one type. */
function checkArray(
  value: ValueArray,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<Type, EvalError> {
  const elementTypes: Type[] = [];
  for (const element of value.elements) {
    const result = checkExpression(element, scopes, block);
    if (!result.ok) {
      return result;
    }
    elementTypes.push(result.value);
  }
  const first = elementTypes[0];
  if (first) {
    for (let i = 1; i < elementTypes.length; i++) {
      if (!typesEqual(elementTypes[i], first)) {
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
  return ok({ kind: "array", element: first ?? { kind: "number" } });
}

/** Check an index expression: the target is an array and the index is a number. */
function checkIndex(
  value: ValueIndex,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<Type, EvalError> {
  const target = checkExpression(value.target, scopes, block);
  if (!target.ok) {
    return target;
  }
  const index = checkExpression(value.index, scopes, block);
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
  if (indexType.kind !== "number") {
    return err({
      kind: "TypeMismatch",
      name: "[",
      expected: "number",
      actual: typeToString(indexType),
      position: value.index.position,
    });
  }
  return ok(targetType.element);
}

/**
 * Check that a type can coerce to a number (numbers, bools, and integers can;
 * arrays, pointers, and ranges cannot). Used for `return` values, `if`/`while`
 * conditions, and `..` range bounds, where the evaluator would otherwise emit
 * a placeholder error.
 */
export function checkNumericCoercible(
  type: Type,
  name: string,
  position: number,
): Result<null, EvalError> {
  if (type.kind === "array" || type.kind === "ptr" || type.kind === "range") {
    return err({
      kind: "TypeMismatch",
      name,
      expected: "number",
      actual: typeToString(type),
      position,
    });
  }
  return ok(null);
}

/** Check a `*ptr` dereference: the target must be a pointer. */
function checkDeref(
  value: ValueDeref,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<Type, EvalError> {
  const target = checkExpression(value.target, scopes, block);
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
function checkRange(
  value: ValueRange,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<Type, EvalError> {
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
function checkIf(value: ValueIf, scopes: DeclScopes, block: BlockChecker): Result<Type, EvalError> {
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
  const conditionCoercible = checkNumericCoercible(condition.value, "if", value.condition.position);
  if (!conditionCoercible.ok) {
    return conditionCoercible;
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
 * Check a `match` expression: the scrutinee is declared and numeric-coercible,
 * every arm's pattern type matches the scrutinee's, all arm values share one
 * type, and a `_` wildcard arm is present (so the expression is total).
 */
function checkMatch(
  value: ValueMatch,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<Type, EvalError> {
  const scrutinee = checkExpression(value.scrutinee, scopes, block);
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
        arm.pattern.kind === "number" ? { kind: "number" } : { kind: "bool" };
      if (!typesEqual(patternType, scrutineeStatic)) {
        return err({
          kind: "TypeMismatch",
          name: "case",
          expected: typeToString(scrutineeStatic),
          actual: typeToString(patternType),
          position: arm.pattern.position,
        });
      }
    }
    const checked = checkExpression(arm.value, scopes, block);
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
  return ok(armType ?? { kind: "number" });
}

/** Check an `is` type-test: the operand is declared and the type name resolves. */
function checkIs(value: ValueIs, scopes: DeclScopes, block: BlockChecker): Result<Type, EvalError> {
  const operand = checkExpression(value.operand, scopes, block);
  if (!operand.ok) {
    return operand;
  }
  if (!typeFromName(value.type)) {
    return err({ kind: "UnknownType", name: value.type, position: value.position });
  }
  return ok({ kind: "number" });
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
): Result<Type, EvalError> {
  if (value.kind === "number") {
    if (value.suffix) {
      // A suffixed integer literal must fit within its type's range.
      if (!intLiteralInRange(value.suffix, value.value)) {
        return err({
          kind: "IntegerOutOfRange",
          type: value.suffix,
          value: value.value,
          position: value.position,
        });
      }
      return ok({ kind: "int", name: value.suffix });
    }
    return ok({ kind: "number" });
  }
  if (value.kind === "bool") {
    return ok({ kind: "bool" });
  }
  if (value.kind === "ident") {
    const decl = lookup(scopes, value.name);
    if (!decl) {
      return err({ kind: "UnknownIdentifier", name: value.name, position: value.position });
    }
    return ok(decl.type);
  }
  if (value.kind === "binary") {
    return checkBinary(value, scopes, block);
  }
  if (value.kind === "is") {
    return checkIs(value, scopes, block);
  }
  if (value.kind === "array") {
    return checkArray(value, scopes, block);
  }
  if (value.kind === "index") {
    return checkIndex(value, scopes, block);
  }
  if (value.kind === "addressOf") {
    if (value.target.kind !== "ident") {
      const target = checkExpression(value.target, scopes, block);
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
    const target = checkExpression(value.target, scopes, block);
    if (!target.ok) {
      return target;
    }
    return ok({ kind: "ptr", mutable: value.mutable, pointee: target.value });
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
  if (value.kind === "match") {
    return checkMatch(value, scopes, block);
  }
  if (value.kind === "block") {
    return block(value.statements, scopes);
  }
  // An lvalue is never read as a value; the evaluator rejects it.
  return ok({ kind: "number" });
}
