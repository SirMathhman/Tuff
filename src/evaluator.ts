import type { AstNode } from "./ast.ts";

/**
 * Evaluate an AST node to a number.
 * @param {AstNode} node - The AST node to evaluate.
 * @returns {number} The evaluated value.
 */
export function evalAst(node: AstNode): number {
  if (node.kind === "num") {
    return node.value;
  }
  const left = evalAst(node.left);
  const right = evalAst(node.right);
  switch (node.op) {
    case "+":
      return left + right;
    default: {
      const exhaustive: never = node.op;
      return exhaustive;
    }
  }
}
