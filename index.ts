import { tokenize } from "./tokens";
import { parse } from "./parser";
import type { Expr } from "./ast";

type Env = Map<string, number>;

function evalAst(expr: Expr, env: Env): number {
  switch (expr.kind) {
    case "number":
      return expr.value;
    case "variable": {
      const value = env.get(expr.name);
      if (value === undefined) {
        throw new Error(`Undefined variable: ${expr.name}`);
      }
      return value;
    }
    case "let": {
      const value = evalAst(expr.value, env);
      env.set(expr.name, value);
      return value;
    }
    case "block": {
      let result = 0;
      for (const statement of expr.statements) {
        result = evalAst(statement, env);
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

export function evaluate(source: string): number {
  if (source === "") {
    return 0;
  }

  const tokens = tokenize(source);
  const ast = parse(tokens);
  return evalAst(ast, new Map());
}
