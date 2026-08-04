import type { Expr, Stmt, Program } from "./parser";

type Binding = { value: number; mutable: boolean };
type Env = Map<string, Binding>;

export function evaluateProgram(program: Program): number {
  const env: Env = new Map();
  let result = 0;
  for (const stmt of program.statements) {
    result = evalStmt(stmt, env);
  }
  return result;
}

function evalExpr(expr: Expr, env: Env): number {
  switch (expr.type) {
    case "number":
      return expr.value;
    case "boolean":
      return expr.value ? 1 : 0;
    case "identifier":
      return env.get(expr.name)?.value ?? 0;
    case "binary":
      return apply(expr.operator, evalExpr(expr.left, env), evalExpr(expr.right, env));
    case "block":
      return evalBlock(expr.statements, new Map(env));
  }
}

function evalBlock(statements: Stmt[], env: Env): number {
  let result = 0;
  for (const stmt of statements) {
    result = evalStmt(stmt, env);
  }
  const last = statements[statements.length - 1];
  if (last && last.type === "let") {
    throw new Error("Block must end with an expression");
  }
  return result;
}

function evalStmt(stmt: Stmt, env: Env): number {
  switch (stmt.type) {
    case "let":
      env.set(stmt.name, { value: evalExpr(stmt.value, env), mutable: stmt.mut });
      return 0;
    case "assign": {
      const binding = env.get(stmt.name);
      if (!binding) {
        throw new Error(`Cannot assign to undeclared variable: ${stmt.name}`);
      }
      if (!binding.mutable) {
        throw new Error(`Cannot assign to immutable variable: ${stmt.name}`);
      }
      binding.value = evalExpr(stmt.value, env);
      return 0;
    }
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
    case "||":
      return left || right;
    case "==":
      return left === right ? 1 : 0;
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}
