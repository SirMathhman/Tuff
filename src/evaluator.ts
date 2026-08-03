import type { AST } from "./types";

export function evaluate(ast: AST, env: Record<string, number> = {}): number {
  switch (ast.type) {
    case "number":
      return ast.value;
    case "identifier": {
      const value = env[ast.name];
      if (value === undefined) {
        throw new Error(`Undefined variable: ${ast.name}`);
      }
      return value;
    }
    case "let": {
      const value = evaluate(ast.value, env);
      env[ast.name] = value;
      return value;
    }
    case "block": {
      const childEnv = Object.create(env) as Record<string, number>;
      let result = 0;
      for (const statement of ast.statements) {
        result = evaluate(statement, childEnv);
      }
      return result;
    }
    case "binary": {
      const left = evaluate(ast.left, env);
      const right = evaluate(ast.right, env);
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
    case "unary":
      return -evaluate(ast.operand, env);
  }
}
