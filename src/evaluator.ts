import type { AST } from "./types";
import { Environment } from "./environment";

export function evaluate(ast: AST, env: Environment = new Environment()): number {
  switch (ast.type) {
    case "number":
      return ast.value;
    case "identifier":
      return env.lookup(ast.name);
    case "let": {
      const value = evaluate(ast.value, env);
      env.define(ast.name, value, ast.mutable);
      return value;
    }
    case "assign": {
      const value = evaluate(ast.value, env);
      env.assign(ast.name, value);
      return value;
    }
    case "block": {
      const childEnv = env.child();
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
