import type { Expr } from "./ast";

/**
 * Walk an expression AST and compute the numeric result.
 */
export function evaluateExpr(node: Expr): number {
  if (node.type === "number") return node.value;

  const left = evaluateExpr(node.left);
  const right = evaluateExpr(node.right);

  switch (node.op) {
    case "+": return left + right;
    case "-": return left - right;
    case "*": return left * right;
    case "/": return left / right;
  }
}
