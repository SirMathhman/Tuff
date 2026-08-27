import type { TuffExpr, TuffStatement } from "../ast.ts";
import { bool } from "../values.ts";
import type { DeclaredBinding, ResolveDeref } from "./kinds.ts";
import { isRightMatch } from "./is-match.ts";

/**
 * Constant-fold the `is` type-tests in a single statement's own expressions,
 * in place. Nested statements are folded separately by the check walk, which
 * calls this with the correct scope stack for each statement. A suffix test
 * matches the left literal's suffix; a kind test (e.g. `Bool`) matches the
 * left's statically inferred kind. The result is always a boolean literal.
 * @param stmt - The statement to fold.
 * @param scopes - The stack of declared bindings for this statement.
 * @param resolveDeref - The dereference resolver, for kind inference.
 */
export function foldStatement(
  stmt: TuffStatement,
  scopes: Record<string, DeclaredBinding>[],
  resolveDeref: ResolveDeref,
): void {
  if (stmt.kind === "Let" || stmt.kind === "Return") {
    stmt.value = foldExpr(stmt.value, scopes, resolveDeref);
  } else if (stmt.kind === "Assign") {
    stmt.value = foldExpr(stmt.value, scopes, resolveDeref);
  } else if (stmt.kind === "If" || stmt.kind === "While") {
    stmt.condition = foldExpr(stmt.condition, scopes, resolveDeref);
  } else if (stmt.kind === "For") {
    stmt.range = foldExpr(stmt.range, scopes, resolveDeref);
  }
}

/**
 * Fold the `is` type-tests in an expression, returning the (possibly
 * replaced) expression.
 * @param expr - The expression to fold.
 * @param scopes - The stack of declared bindings.
 * @param resolveDeref - The dereference resolver, for kind inference.
 * @returns The folded expression: a boolean literal where an `Is` node was,
 * the same node otherwise.
 */
function foldExpr(
  expr: TuffExpr,
  scopes: Record<string, DeclaredBinding>[],
  resolveDeref: ResolveDeref,
): TuffExpr {
  if (expr.kind === "Is") {
    const left = foldExpr(expr.left, scopes, resolveDeref);
    return {
      kind: "Literal",
      value: bool(isRightMatch(left, expr.right, scopes, resolveDeref)),
    };
  }
  if (
    expr.kind === "Or" ||
    expr.kind === "And" ||
    expr.kind === "Add" ||
    expr.kind === "Equal" ||
    expr.kind === "Less" ||
    expr.kind === "Range"
  ) {
    expr.left = foldExpr(expr.left, scopes, resolveDeref);
    expr.right = foldExpr(expr.right, scopes, resolveDeref);
    return expr;
  }
  if (
    expr.kind === "Ref" ||
    expr.kind === "Deref" ||
    expr.kind === "TupleIndex"
  ) {
    expr.operand = foldExpr(expr.operand, scopes, resolveDeref);
    return expr;
  }
  if (expr.kind === "ArrayIndex") {
    expr.operand = foldExpr(expr.operand, scopes, resolveDeref);
    expr.index = foldExpr(expr.index, scopes, resolveDeref);
    return expr;
  }
  if (expr.kind === "Tuple" || expr.kind === "Array") {
    expr.elements = expr.elements.map((element) =>
      foldExpr(element, scopes, resolveDeref),
    );
    return expr;
  }
  return expr;
}
