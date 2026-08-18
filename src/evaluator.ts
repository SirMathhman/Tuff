import type { AstNode } from "./ast.js";

/**
 * Computes the numeric value of an AST.
 *
 * The AST is well-formed by construction (the parser only produces valid
 * nodes), so this function is total and needs no Result.
 *
 * @param node - The AST to evaluate.
 * @returns The numeric value of the expression.
 */
export function evaluateAst(node: AstNode): number {
  if (node.kind === "number") {
    return node.value;
  }

  const left = evaluateAst(node.left);
  const right = evaluateAst(node.right);

  switch (node.op) {
    case "plus":
      return left + right;
    case "minus":
      return left - right;
    case "times":
      return left * right;
  }
}
