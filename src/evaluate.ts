import type { Expr, Stmt } from "./ast";
import { Scope } from "./ast";

/**
 * Walk an expression AST and compute the numeric result.
 */
export function evaluateExpr(node: Expr, scope: Scope = new Scope()): number {
  if (node.type === "number") return node.value;

  if (node.type === "varref") {
    const val = scope.get(node.name);
    if (val === undefined) throw new Error(`Undefined variable '${node.name}'`);
    return val;
  }

  if (node.type === "block") {
    const childScope = new Scope(scope);
    let lastVal: number = 0;
    for (const stmt of node.statements) {
      lastVal = evaluateStmt(stmt, childScope);
    }
    return lastVal;
  }

  if (node.type === "binop") {
    const left = evaluateExpr(node.left, scope);
    const right = evaluateExpr(node.right, scope);

    switch (node.op) {
      case "+": return left + right;
      case "-": return left - right;
      case "*": return left * right;
      case "/": return left / right;
    }
  }

  if (node.type === "assign") {
    if (!scope.isMutable(node.name)) {
      throw new Error(`Cannot reassign immutable variable '${node.name}'`);
    }
    const value = evaluateExpr(node.valueExpr, scope);
    scope.set(node.name, value);
    return value;
  }

  // Exhaustive check — all Expr variants handled above
  const _exhaustive: never = node;
  throw new Error(`Unknown expression type: ${(_exhaustive as any).type}`);
}

/** Evaluate a statement and return its numeric result */
function evaluateStmt(stmt: Stmt, scope: Scope): number {
  if (stmt.type === "letdecl") {
    const value = evaluateExpr(stmt.valueExpr, scope);
    scope.set(stmt.name, value);
    if (stmt.mutable) scope.declareMutable(stmt.name);
    return 0;
  }

  // exprstmt — just evaluate the expression and discard side effects
  return evaluateExpr(stmt.expr, scope);
}
