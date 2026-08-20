import type { Statement, Value } from "../core/ast.js";
import { err, ok, type EvalError, type Result } from "../core/errors.js";
import { isSubtype, typeToString, type DeclScopes, type Type } from "./types.js";

/**
 * A block-statement checker, threaded through the expression checker as an
 * explicit dependency. Block values and statements mutually recurse (a block
 * value's statements are checked by the statement checker), so the typechecker
 * passes its checker in here rather than importing it (module cycle). It
 * returns the block value's type (that of its final bare expression).
 */
export type BlockChecker = (statements: Statement[], scopes: DeclScopes) => Result<Type, EvalError>;

/**
 * The expression checker itself, threaded into the per-kind handlers as an
 * explicit dependency. The handlers and the dispatch mutually recurse (a
 * handler checks sub-expressions via the dispatch), so the dispatch passes
 * itself in here rather than the handlers importing it (module cycle).
 */
export type CheckExpressionFn = (
  value: Value,
  scopes: DeclScopes,
  block: BlockChecker,
) => Result<Type, EvalError>;

/** Whether two types can be compared with `==`/`!=`: both bools, or numeric types in a subtype relation. */
export function comparableTypes(a: Type, b: Type): boolean {
  if (a.kind === "bool" && b.kind === "bool") {
    return true;
  }
  const numeric = (t: Type): boolean => t.kind === "int" || t.kind === "float";
  if (!numeric(a) || !numeric(b)) {
    return false;
  }
  return isSubtype(a, b) || isSubtype(b, a);
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
