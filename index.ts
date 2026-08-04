import { tokenize } from "./tokenizer";
import { parse, type Expr } from "./parser";

export function evaluate(source: string): number {
  const tokens = tokenize(source);
  if (tokens.length === 0) {
    return 0;
  }
  return evalExpr(parse(tokens));
}

function evalExpr(expr: Expr): number {
  switch (expr.type) {
    case "number":
      return expr.value;
    case "binary":
      return apply(expr.operator, evalExpr(expr.left), evalExpr(expr.right));
  }
}

function apply(operator: string, left: number, right: number): number {
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return left / right;
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}
