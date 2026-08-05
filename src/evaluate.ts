import type { Expr } from "./ast";

/**
 * Walk an expression AST and compute the numeric result.
 */
export function evaluateExpr(node: Expr, scope: Map<string, number> = new Map()): number {
  if (node.type === "number") return node.value;

  if (node.type === "varref") {
    const val = scope.get(node.name);
    if (val === undefined) throw new Error(`Undefined variable '${node.name}'`);
    return val;
  }

  if (node.type === "block") {
    let lastVal: number = 0;
    for (const stmt of node.statements) {
      if (stmt.type === "letdecl") {
        scope.set(stmt.name, evaluateExpr(stmt.value, scope));
      } else {
        lastVal = evaluateExpr(stmt as Expr, scope);
      }
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

  // Exhaustive check — all Expr variants handled above
  const _exhaustive: never = node;
  throw new Error(`Unknown expression type: ${(_exhaustive as any).type}`);
}
