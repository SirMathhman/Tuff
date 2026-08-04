import type { Expr, Stmt, Program } from "./parser";

type Value = { kind: "number"; value: number } | { kind: "boolean"; value: boolean };
type Flow =
  | { kind: "value"; value: Value }
  | { kind: "break" }
  | { kind: "continue" };
type Binding = { value: Value; mutable: boolean };
type Env = Map<string, Binding>;

export function evaluateProgram(program: Program): number {
  const env: Env = new Map();
  let result: Flow = { kind: "value", value: { kind: "number", value: 0 } };
  for (const stmt of program.statements) {
    result = evalStmt(stmt, env);
  }
  return toNumber(result.kind === "value" ? result.value : { kind: "number", value: 0 });
}

function toNumber(value: Value): number {
  return value.kind === "number" ? value.value : value.value ? 1 : 0;
}

function flowValue(flow: Flow): Value {
  return flow.kind === "value" ? flow.value : { kind: "number", value: 0 };
}

function evalExpr(expr: Expr, env: Env): Flow {
  switch (expr.type) {
    case "number":
      return { kind: "value", value: { kind: "number", value: expr.value } };
    case "boolean":
      return { kind: "value", value: { kind: "boolean", value: expr.value } };
    case "identifier":
      return { kind: "value", value: env.get(expr.name)?.value ?? { kind: "number", value: 0 } };
    case "binary":
      return { kind: "value", value: apply(expr.operator, flowValue(evalExpr(expr.left, env)), flowValue(evalExpr(expr.right, env))) };
    case "unary":
      return { kind: "value", value: applyUnary(expr.operator, flowValue(evalExpr(expr.operand, env))) };
    case "if":
      return toNumber(flowValue(evalExpr(expr.condition, env))) !== 0
        ? evalStmt(expr.then, env)
        : evalStmt(expr.otherwise, env);
    case "while": {
      let result: Flow = { kind: "value", value: { kind: "number", value: 0 } };
      while (toNumber(flowValue(evalExpr(expr.condition, env))) !== 0) {
        result = evalStmt(expr.body, env);
        if (result.kind === "break") {
          break;
        }
        if (result.kind === "continue") {
          continue;
        }
      }
      return result;
    }
    case "block":
      return evalBlock(expr.statements, new Map(env));
  }
}

function evalBlock(statements: Stmt[], env: Env): Flow {
  let result: Flow = { kind: "value", value: { kind: "number", value: 0 } };
  for (const stmt of statements) {
    result = evalStmt(stmt, env);
    if (result.kind === "break" || result.kind === "continue") {
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
      env.set(stmt.name, { value: flowValue(evalExpr(stmt.value, env)), mutable: stmt.mut });
      return { kind: "value", value: { kind: "number", value: 0 } };
    case "assign": {
      const binding = getMutableBinding(env, stmt.name);
      binding.value = flowValue(evalExpr(stmt.value, env));
      return { kind: "value", value: { kind: "number", value: 0 } };
    }
    case "compoundAssign": {
      const binding = getMutableBinding(env, stmt.name);
      binding.value = apply(stmt.operator, binding.value, flowValue(evalExpr(stmt.value, env)));
      return { kind: "value", value: { kind: "number", value: 0 } };
    }
    case "break":
      return { kind: "break" };
    case "continue":
      return { kind: "continue" };
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
