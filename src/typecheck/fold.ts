import type { TuffExpr, TuffStatement } from "../ast.ts";
import { bool } from "../values.ts";
import type { ExprCheckContext } from "./kinds.ts";
import { isRightMatch } from "./is-match.ts";

/**
 * Constant-fold the `is` type-tests in a single statement's own expressions,
 * in place. Nested statements are folded separately by the check walk, which
 * calls this with the correct scope stack for each statement. A suffix test
 * matches the left literal's suffix; a kind test (e.g. `Bool`) matches the
 * left's statically inferred kind. The result is always a boolean literal.
 * @param stmt - The statement to fold.
 * @param context - The expression check context.
 */
export function foldStatement(
  stmt: TuffStatement,
  context: ExprCheckContext,
): void {
  if (stmt.kind === "Let" || stmt.kind === "Return") {
    stmt.value = foldExpr(stmt.value, context);
  } else if (stmt.kind === "Assign") {
    stmt.value = foldExpr(stmt.value, context);
  } else if (stmt.kind === "If" || stmt.kind === "While") {
    stmt.condition = foldExpr(stmt.condition, context);
  } else if (stmt.kind === "For") {
    stmt.range = foldExpr(stmt.range, context);
  }
}

/**
 * Fold the `is` type-tests in an expression, returning the (possibly
 * replaced) expression.
 * @param expr - The expression to fold.
 * @param context - The expression check context.
 * @returns The folded expression: a boolean literal where an `Is` node was,
 * the same node otherwise.
 */
function foldExpr(expr: TuffExpr, context: ExprCheckContext): TuffExpr {
  if (expr.kind === "Is") {
    const left = foldExpr(expr.left, context);
    return {
      kind: "Literal",
      value: bool(isRightMatch(left, expr.right, context)),
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
    expr.left = foldExpr(expr.left, context);
    expr.right = foldExpr(expr.right, context);
    return expr;
  }
  if (
    expr.kind === "Ref" ||
    expr.kind === "Deref" ||
    expr.kind === "TupleIndex" ||
    expr.kind === "FieldAccess"
  ) {
    expr.operand = foldExpr(expr.operand, context);
    return expr;
  }
  if (expr.kind === "ArrayIndex") {
    expr.operand = foldExpr(expr.operand, context);
    expr.index = foldExpr(expr.index, context);
    return expr;
  }
  if (expr.kind === "Tuple" || expr.kind === "Array") {
    expr.elements = expr.elements.map((element) => foldExpr(element, context));
    return expr;
  }
  if (expr.kind === "StructLiteral") {
    expr.fields = expr.fields.map((field) => ({
      ...field,
      value: foldExpr(field.value, context),
    }));
    return expr;
  }
  return expr;
}
