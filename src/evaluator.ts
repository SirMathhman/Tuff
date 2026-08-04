import type { Expr, Stmt, Program } from "./parser";

type Value = { kind: "number"; value: number } | { kind: "boolean"; value: boolean };
type Flow = { value: Value; break: boolean };
type Binding = { value: Value; mutable: boolean };
type Env = Map<string, Binding>;

export function evaluateProgram(program: Program): number {
  const env: Env = new Map();
  let result: Flow = { value: { kind: "number", value: 0 }, break: false };
  for (const stmt of program.statements) {
    result = evalStmt(stmt, env);
  }
  return toNumber(result.value);
}

function toNumber(value: Value): number {
  return value.kind === "number" ? value.value : value.value ? 1 : 0;
}

function evalExpr(expr: Expr, env: Env): Flow {
  switch (expr.type) {
    case "number":
      return { value: { kind: "number", value: expr.value }, break: false };
    case "boolean":
      return { value: { kind: "boolean", value: expr.value }, break: false };
    case "identifier":
      return { value: env.get(expr.name)?.value ?? { kind: "number", value: 0 }, break: false };
    case "binary":
      return { value: apply(expr.operator, evalExpr(expr.left, env).value, evalExpr(expr.right, env).value), break: false };
    case "unary":
      return { value: applyUnary(expr.operator, evalExpr(expr.operand, env).value), break: false };
    case "if":
      return toNumber(evalExpr(expr.condition, env).value) !== 0
        ? evalStmt(expr.then, env)
        : evalStmt(expr.otherwise, env);
    case "while": {
      let result: Flow = { value: { kind: "number", value: 0 }, break: false };
      while (toNumber(evalExpr(expr.condition, env).value) !== 0) {
        result = evalStmt(expr.body, env);
        if (result.break) {
          result.break = false;
          break;
        }
      }
      return result;
    }
    case "block":
      return evalBlock(expr.statements, new Map(env));
  }
}

function evalBlock(statements: Stmt[], env: Env): Flow {
  let result: Flow = { value: { kind: "number", value: 0 }, break: false };
  for (const stmt of statements) {
    result = evalStmt(stmt, env);
    if (result.break) {
      return result;
    }
  }
  const last = statements[statements.length - 1];
  if (last && last.type === "let") {
    throw new Error("Block must end with an expression");
  }
  return result;
}

function evalStmt(stmt: Stmt, env: Env): Flow {
  switch (stmt.type) {
    case "let":
      env.set(stmt.name, { value: evalExpr(stmt.value, env).value, mutable: stmt.mut });
      return { value: { kind: "number", value: 0 }, break: false };
    case "assign": {
      const binding = getMutableBinding(env, stmt.name);
      binding.value = evalExpr(stmt.value, env).value;
      return { value: { kind: "number", value: 0 }, break: false };
    }
    case "compoundAssign": {
      const binding = getMutableBinding(env, stmt.name);
      binding.value = apply(stmt.operator, binding.value, evalExpr(stmt.value, env).value);
      return { value: { kind: "number", value: 0 }, break: false };
    }
    case "break":
      return { value: { kind: "number", value: 0 }, break: true };
    case "expr":
      return evalExpr(stmt.expr, env);
  }
}

function getMutableBinding(env: Env, name: string): Binding {
  const binding = env.get(name);
  if (!binding) {
    throw new Error(`Cannot assign to undeclared variable: ${name}`);
  }
  if (!binding.mutable) {
    throw new Error(`Cannot assign to immutable variable: ${name}`);
  }
  return binding;
}

function applyUnary(operator: string, operand: Value): Value {
  switch (operator) {
    case "!":
      return { kind: "boolean", value: toNumber(operand) === 0 };
    case "-":
      return { kind: "number", value: -toNumber(operand) };
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

function apply(operator: string, left: Value, right: Value): Value {
  switch (operator) {
    case "+":
      return { kind: "number", value: toNumber(left) + toNumber(right) };
    case "-":
      return { kind: "number", value: toNumber(left) - toNumber(right) };
    case "*":
      return { kind: "number", value: toNumber(left) * toNumber(right) };
    case "/":
      return { kind: "number", value: toNumber(left) / toNumber(right) };
    case "||":
      return { kind: "boolean", value: toNumber(left) !== 0 || toNumber(right) !== 0 };
    case "&&":
      return { kind: "boolean", value: toNumber(left) !== 0 && toNumber(right) !== 0 };
    case "==":
      return { kind: "boolean", value: left.kind === right.kind && left.value === right.value };
    case "!=":
      return { kind: "boolean", value: left.kind !== right.kind || left.value !== right.value };
    case "<":
      return { kind: "boolean", value: toNumber(left) < toNumber(right) };
    case "<=":
      return { kind: "boolean", value: toNumber(left) <= toNumber(right) };
    case ">":
      return { kind: "boolean", value: toNumber(left) > toNumber(right) };
    case ">=":
      return { kind: "boolean", value: toNumber(left) >= toNumber(right) };
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}
