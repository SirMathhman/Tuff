import type { Expr } from "./ast";
import { Env } from "./env";

export function evalAst(expr: Expr, env: Env): number {
  switch (expr.kind) {
    case "number":
      return expr.value;
    case "variable": {
      return env.get(expr.name);
    }
    case "let": {
      const value = evalAst(expr.value, env);
      env.define(expr.name, value);
      return value;
    }
    case "block": {
      const blockEnv = env.child();
      let result = 0;
      for (const statement of expr.statements) {
        result = evalAst(statement, blockEnv);
      }
      return result;
    }
    case "binary": {
      const left = evalAst(expr.left, env);
      const right = evalAst(expr.right, env);

      switch (expr.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
      }
    }
  }
}
