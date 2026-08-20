import type { Value, ValueNumber } from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { lookup } from "../core/scopes.js";
import {
  FLOAT_ANY,
  INT_ANY,
  INT_BOUNDS,
  INT_LITERAL_BOUNDS,
  intLiteralInRange,
  type DeclScopes,
  type Type,
} from "./types.js";

/**
 * The static type of a numeric literal, or an `IntegerOutOfRange` error when
 * a suffixed literal falls outside its type's range (or an unsuffixed integer
 * literal falls outside the `Int` span).
 */
function checkNumberLiteral(value: ValueNumber): Result<Type, EvalError> {
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
import { checkArray, checkBinary, checkIndex } from "./checkBinaryOps.js";
import {
  checkAddressOf,
  checkDeref,
  checkIf,
  checkIs,
  checkMatch,
  checkRange,
} from "./checkControlFlow.js";
import type { BlockChecker } from "./checkPredicates.js";

/**
 * Check that every identifier in a value expression is declared in the current
 * scope stack and that the expression is well-typed. Returns the expression's
 * static type on success. Per-kind handlers live in sibling files grouped by
 * concern (`checkBinaryOps`, `checkControlFlow`); this is the dispatch.
 */
export function checkExpression(
  value: Value,
  scopes: DeclScopes,
  block: BlockChecker,
): Result<Type, EvalError> {
  if (value.kind === "number") {
    return checkNumberLiteral(value);
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
    return checkBinary(value, scopes, block, checkExpression);
  }
  if (value.kind === "is") {
    return checkIs(value, scopes, block, checkExpression);
  }
  if (value.kind === "array") {
    return checkArray(value, scopes, block, checkExpression);
  }
  if (value.kind === "index") {
    return checkIndex(value, scopes, block, checkExpression);
  }
  if (value.kind === "addressOf") {
    return checkAddressOf(value, scopes, block, checkExpression);
  }
  if (value.kind === "deref") {
    return checkDeref(value, scopes, block, checkExpression);
  }
  if (value.kind === "range") {
    return checkRange(value, scopes, block, checkExpression);
  }
  if (value.kind === "if") {
    return checkIf(value, scopes, block, checkExpression);
  }
  if (value.kind === "match") {
    return checkMatch(value, scopes, block, checkExpression);
  }
  if (value.kind === "block") {
    return block(value.statements, scopes);
  }
  // An lvalue is never read as a value; the evaluator rejects it.
  return ok({ kind: "int", name: INT_ANY });
}
