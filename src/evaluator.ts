import type { AST } from "./parser";

export function evaluate(ast: AST): number {
  switch (ast.type) {
    case "number":
      return ast.value;
    case "binary": {
      const left = evaluate(ast.left);
      const right = evaluate(ast.right);
      switch (ast.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return Math.trunc(left / right);
      }
    }
  }
}
