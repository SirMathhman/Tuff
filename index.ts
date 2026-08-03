import { tokenize } from "./tokens";
import { parse } from "./parser";
import type { Expr } from "./ast";

function evalAst(expr: Expr): number {
  switch (expr.kind) {
    case "number":
      return expr.value;
    case "binary": {
      const left = evalAst(expr.left);
      const right = evalAst(expr.right);

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
  return evalAst(ast);
}
