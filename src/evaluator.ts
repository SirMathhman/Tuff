import type { AST } from "./types";
import { Environment } from "./environment";

export function evaluate(ast: AST, env: Environment = new Environment()): number {
  switch (ast.type) {
    case "number":
      return ast.value;
    case "boolean":
      return ast.value ? 1 : 0;
    case "identifier":
      return env.lookup(ast.name);
    case "let": {
      const value = evaluate(ast.value, env);
      env.define(ast.name, value, ast.mutable);
      return value;
    }
    case "assign": {
      const value = evaluate(ast.value, env);
      if (ast.operator === "=") {
        env.assign(ast.name, value);
        return value;
      }
      const current = env.lookup(ast.name);
      let result: number;
      switch (ast.operator) {
        case "+=":
          result = current + value;
          break;
        case "-=":
          result = current - value;
          break;
        case "*=":
          result = current * value;
          break;
        case "/=":
          result = Math.trunc(current / value);
          break;
        default:
          throw new Error(`Unknown assignment operator: ${ast.operator}`);
      }
      env.assign(ast.name, result);
      return result;
    }
    case "if": {
      const condition = evaluate(ast.condition, env);
      if (condition !== 0) {
        return evaluate(ast.then, env);
      }
      if (!ast.else) {
        throw new Error("If expression without else evaluated to false");
      }
      return evaluate(ast.else, env);
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
        case "<":
          return left < right ? 1 : 0;
        case ">":
          return left > right ? 1 : 0;
        case "<=":
          return left <= right ? 1 : 0;
        case ">=":
          return left >= right ? 1 : 0;
        case "==":
          return left === right ? 1 : 0;
        case "!=":
          return left !== right ? 1 : 0;
      }
    }
    case "unary":
      return -evaluate(ast.operand, env);
  }
}
