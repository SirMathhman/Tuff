import type { TuffExpr, TuffStatement } from "../ast.ts";
import { bool } from "../values.ts";

/**
 * Constant-fold every `is` type-test in a program into a boolean literal,
 * in place. The result of an `is` test is fully determined statically (the
 * left literal's suffix vs. the right suffix name), so the typechecker
 * resolves it before execution; the evaluator never sees an `Is` node.
 * @param statements - The parsed program statements, mutated in place.
 * @returns The same statement list, with `Is` nodes folded.
 */
export function foldProgram(statements: TuffStatement[]): TuffStatement[] {
  for (const stmt of statements) {
    foldStatement(stmt);
  }
  return statements;
}

/**
 * Fold the `is` type-tests in a single statement's expressions.
 * @param stmt - The statement to fold.
 */
function foldStatement(stmt: TuffStatement): void {
  if (stmt.kind === "Let" || stmt.kind === "Return") {
    stmt.value = foldExpr(stmt.value);
  } else if (stmt.kind === "Assign") {
    stmt.value = foldExpr(stmt.value);
  } else if (stmt.kind === "If") {
    stmt.condition = foldExpr(stmt.condition);
    foldStatement(stmt.then);
    if (stmt.else) foldStatement(stmt.else);
  } else if (stmt.kind === "While") {
    stmt.condition = foldExpr(stmt.condition);
    foldStatement(stmt.body);
  } else if (stmt.kind === "For") {
    stmt.range = foldExpr(stmt.range);
    foldStatement(stmt.body);
  } else if (stmt.kind === "Block") {
    foldProgram(stmt.statements);
  }
}

/**
 * Fold the `is` type-tests in an expression, returning the (possibly
 * replaced) expression.
 * @param expr - The expression to fold.
 * @returns The folded expression: a boolean literal where an `Is` node was,
 * the same node otherwise.
 */
function foldExpr(expr: TuffExpr): TuffExpr {
  if (expr.kind === "Is") {
    const left = foldExpr(expr.left);
    const name = expr.right.kind === "Identifier" ? expr.right.name : "";
    const matches =
      left.kind === "Literal" &&
      (name === "Bool" ? left.value.kind === "bool" : left.suffix === name);
    return { kind: "Literal", value: bool(matches) };
  }
  if (
    expr.kind === "Or" ||
    expr.kind === "And" ||
    expr.kind === "Add" ||
    expr.kind === "Equal" ||
    expr.kind === "Less" ||
    expr.kind === "Range"
  ) {
    expr.left = foldExpr(expr.left);
    expr.right = foldExpr(expr.right);
    return expr;
  }
  if (
    expr.kind === "Ref" ||
    expr.kind === "Deref" ||
    expr.kind === "TupleIndex"
  ) {
    expr.operand = foldExpr(expr.operand);
    return expr;
  }
  if (expr.kind === "ArrayIndex") {
    expr.operand = foldExpr(expr.operand);
    expr.index = foldExpr(expr.index);
    return expr;
  }
  if (expr.kind === "Tuple" || expr.kind === "Array") {
    expr.elements = expr.elements.map((element) => foldExpr(element));
    return expr;
  }
  return expr;
}
