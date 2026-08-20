import type {
  MatchPatternNumber,
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
  FLOAT_ANY,
  INT_ANY,
  INT_BOUNDS,
  INT_LITERAL_BOUNDS,
  intLiteralInRange,
  isSubtype,
  isUnsignedInt,
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

/** Whether two types can be compared with `==`/`!=`: both bools, or numeric types in a subtype relation. */
function comparableTypes(a: Type, b: Type): boolean {
  if (a.kind === "bool" && b.kind === "bool") {
    return true;
  }
  const numeric = (t: Type): boolean => t.kind === "int" || t.kind === "float";
  if (!numeric(a) || !numeric(b)) {
    return false;
  }
  return isSubtype(a, b) || isSubtype(b, a);
}

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

/**
 * Check that a type can coerce to a number (bools, integers, and floats can;
 * arrays, pointers, and ranges cannot). Used for `return` values and `..`
 * range bounds, where the evaluator would otherwise emit a placeholder error.
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

/** Check that a type is a `Bool`, for `if`/`while` conditions. */
export function checkBool(type: Type, name: string, position: number): Result<null, EvalError> {
  if (type.kind !== "bool") {
    return err({
      kind: "TypeMismatch",
      name,
      expected: "bool",
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
  return ok(armType ?? { kind: "int", name: INT_ANY });
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
  return ok({ kind: "bool" });
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
      if (INT_BOUNDS[value.suffix] && !intLiteralInRange(value.suffix, value.value)) {
        return err({
          kind: "IntegerOutOfRange",
          type: value.suffix,
          value: value.value,
          position: value.position,
        });
      }
      return INT_BOUNDS[value.suffix]
        ? ok({ kind: "int", name: value.suffix })
        : ok({ kind: "float", name: value.suffix });
    }
    // Unsuffixed literals are the family supertypes: integer literals are
    // `Int` (range-checked against the full `Int` span), fractional literals
    // are `Float`.
    if (Number.isInteger(value.value)) {
      if (value.value < INT_LITERAL_BOUNDS[0] || value.value > INT_LITERAL_BOUNDS[1]) {
        return err({
          kind: "IntegerOutOfRange",
          type: "int",
          value: value.value,
          position: value.position,
        });
      }
      return ok({ kind: "int", name: INT_ANY });
    }
    return ok({ kind: "float", name: FLOAT_ANY });
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
  return ok({ kind: "int", name: INT_ANY });
}
