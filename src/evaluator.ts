import type { AstNode } from "./ast.ts";

export function evalAst(ast: AstNode): number {
  switch (ast.type) {
    case "number":
      return ast.value;
    case "add":
      return evalAst(ast.left) + evalAst(ast.right);
    case "sub":
      return evalAst(ast.left) - evalAst(ast.right);
    case "mul":
      return evalAst(ast.left) * evalAst(ast.right);
  }
}
