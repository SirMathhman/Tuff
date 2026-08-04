import { tokenize } from "./tokenizer";
import { parse, type Expr, type Stmt } from "./parser";

export function evaluate(source: string): number {
  const tokens = tokenize(source);
  if (tokens.length === 0) {
    return 0;
  }
  return evalExpr(parse(tokens), new Map());
}

function evalExpr(expr: Expr, env: Map<string, number>): number {
  switch (expr.type) {
    case "number":
      return expr.value;
    case "identifier":
      return env.get(expr.name) ?? 0;
    case "binary":
      return apply(expr.operator, evalExpr(expr.left, env), evalExpr(expr.right, env));
    case "block":
      return evalBlock(expr.statements, new Map(env));
  }
}

function evalBlock(statements: Stmt[], env: Map<string, number>): number {
  let result = 0;
  for (const stmt of statements) {
    result = evalStmt(stmt, env);
  }
  return result;
}

function evalStmt(stmt: Stmt, env: Map<string, number>): number {
  switch (stmt.type) {
    case "let":
      env.set(stmt.name, evalExpr(stmt.value, env));
      return 0;
    case "expr":
      return evalExpr(stmt.expr, env);
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
