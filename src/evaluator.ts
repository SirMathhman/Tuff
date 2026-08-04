import type { Expr, Stmt, Program } from "./parser";

type FunctionValue = { params: string[]; body: Expr };
type ObjectValue = Map<string, Value>;
type Value =
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "reference"; binding: Binding }
  | { kind: "function"; value: FunctionValue }
  | { kind: "object"; value: ObjectValue };
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
  if (value.kind === "reference") {
    return toNumber(value.binding.value);
  }
  if (value.kind === "number") {
    return value.value;
  }
  return value.kind === "boolean" && value.value ? 1 : 0;
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
    case "null":
      return { kind: "value", value: { kind: "null" } };
    case "identifier":
      return { kind: "value", value: lookupBinding(env, expr.name).value };
    case "binary":
      return { kind: "value", value: apply(expr.operator, flowValue(evalExpr(expr.left, env)), flowValue(evalExpr(expr.right, env))) };
    case "unary":
      if (expr.operator === "&" || expr.operator === "&mut") {
        const operand = expr.operand;
        if (operand.type !== "identifier") {
          throw new Error("Reference target must be an identifier");
        }
        const binding = lookupBinding(env, operand.name);
        return { kind: "value", value: { kind: "reference", binding } };
      }
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
    case "match": {
      const value = flowValue(evalExpr(expr.value, env));
      for (const arm of expr.arms) {
        if (arm.pattern === null || valuesEqual(arm.pattern, value, env)) {
          return evalExpr(arm.value, env);
        }
      }
      return { kind: "value", value: { kind: "number", value: 0 } };
    }
    case "call": {
      const callee = flowValue(evalExpr(expr.callee, env));
      if (callee.kind !== "function") {
        throw new Error("Cannot call non-function");
      }
      const argValues = expr.args.map((arg) => flowValue(evalExpr(arg, env)));
      if (argValues.length !== callee.value.params.length) {
        throw new Error(`Function expects ${callee.value.params.length} arguments but received ${argValues.length}`);
      }
      const childEnv = new Map(env);
      callee.value.params.forEach((param, i) => {
        childEnv.set(param, { value: argValues[i] ?? { kind: "null" }, mutable: false });
      });
      return evalExpr(callee.value.body, childEnv);
    }
    case "member": {
      const object = flowValue(evalExpr(expr.object, env));
      if (object.kind !== "object") {
        throw new Error("Cannot access member of non-object");
      }
      const prop = object.value.get(expr.property);
      if (!prop) {
        throw new Error(`Object has no property: ${expr.property}`);
      }
      return { kind: "value", value: prop };
    }
    case "object": {
      const props = new Map<string, Value>();
      for (const [key, valExpr] of expr.properties) {
        props.set(key, flowValue(evalExpr(valExpr, env)));
      }
      return { kind: "value", value: { kind: "object", value: props } };
    }
    case "block":
      return evalBlock(expr.statements, new Map(env));
  }
}

function valuesEqual(pattern: Expr, value: Value, env: Env): boolean {
  const patternValue = flowValue(evalExpr(pattern, env));
  return sameValue(deref(patternValue), deref(value));
}

function deref(value: Value): Value {
  return value.kind === "reference" ? deref(value.binding.value) : value;
}

function sameValue(a: Value, b: Value): boolean {
  if (a.kind !== b.kind || a.kind === "reference" || b.kind === "reference") {
    return false;
  }
  if (a.kind === "null") {
    return true;
  }
  const av = a as { kind: "number" | "boolean"; value: number | boolean };
  const bv = b as { kind: "number" | "boolean"; value: number | boolean };
  return av.value === bv.value;
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
    case "function":
      env.set(stmt.name, { value: { kind: "function", value: { params: stmt.params, body: stmt.body } }, mutable: false });
      return { kind: "value", value: { kind: "number", value: 0 } };
    case "let":
      env.set(stmt.name, { value: flowValue(evalExpr(stmt.value, env)), mutable: stmt.mut });
      return { kind: "value", value: { kind: "number", value: 0 } };
    case "assign": {
      const binding = resolveTarget(stmt.target, env);
      if (!binding.mutable) {
        throw new Error("Cannot assign to immutable target");
      }
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

function lookupBinding(env: Env, name: string): Binding {
  const binding = env.get(name);
  if (!binding) {
    throw new Error(`Cannot reference undeclared variable: ${name}`);
  }
  return binding;
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

function resolveTarget(target: Expr, env: Env): Binding {
  if (target.type === "identifier") {
    return getMutableBinding(env, target.name);
  }
  if (target.type === "unary" && target.operator === "*") {
    const value = flowValue(evalExpr(target.operand, env));
    if (value.kind !== "reference") {
      throw new Error("Cannot assign through non-reference");
    }
    return value.binding;
  }
  throw new Error("Invalid assignment target");
}

function applyUnary(operator: string, operand: Value): Value {
  switch (operator) {
    case "!":
      return { kind: "boolean", value: toNumber(operand) === 0 };
    case "-":
      return { kind: "number", value: -toNumber(operand) };
    case "*":
      if (operand.kind !== "reference") {
        throw new Error("Cannot dereference non-reference");
      }
      return operand.binding.value;
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
      return { kind: "boolean", value: sameValue(deref(left), deref(right)) };
    case "!=":
      return { kind: "boolean", value: !sameValue(deref(left), deref(right)) };
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
