import type { Node } from "./ast.ts";
import { divisionByZero, invalidInput, type EvalError } from "./errors.ts";
import type { Result } from "./result.ts";

type Value =
  { type: "number"; value: number } | { type: "bool"; value: boolean };

function toNumber(v: Value): number {
  return v.type === "number" ? v.value : v.value ? 1 : 0;
}

function valuesEqual(a: Value, b: Value): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "number") return a.value === b.value;
  return a.value === b.value;
}

type Env = {
  values: Record<string, Value>;
  mutable: Set<string>;
  parent?: Env;
};

type EvalOutcome = Result<Value, EvalError> | { break: Value };

function isBreak(o: EvalOutcome): o is { break: Value } {
  return "break" in o;
}

function lookup(env: Env, name: string): Value | undefined {
  let frame: Env | undefined = env;
  while (frame !== undefined) {
    const bound = frame.values[name];
    if (bound !== undefined) return bound;
    frame = frame.parent;
  }
  return undefined;
}

function isMutable(env: Env, name: string): boolean {
  let frame: Env | undefined = env;
  while (frame !== undefined) {
    if (frame.mutable.has(name)) return true;
    frame = frame.parent;
  }
  return false;
}

function assignFrame(env: Env, name: string): Env | undefined {
  let frame: Env | undefined = env;
  while (frame !== undefined) {
    if (name in frame.values) return frame;
    frame = frame.parent;
  }
  return undefined;
}

function evalBinaryBool(
  lhs: Node,
  rhs: Node,
  env: Env,
  input: string,
  combine: (a: Value, b: Value) => boolean,
): EvalOutcome {
  const l = evalNode(lhs, env, input);
  if (isBreak(l)) return l;
  if (!l.ok) return l;
  const r = evalNode(rhs, env, input);
  if (isBreak(r)) return r;
  if (!r.ok) return r;
  return {
    ok: true,
    value: { type: "bool", value: combine(l.value, r.value) },
  };
}

function evalArithmetic(
  node: Extract<Node, { type: "binary" }>,
  env: Env,
  input: string,
): EvalOutcome {
  const lhs = evalNode(node.lhs, env, input);
  if (isBreak(lhs)) return lhs;
  if (!lhs.ok) return lhs;
  const rhs = evalNode(node.rhs, env, input);
  if (isBreak(rhs)) return rhs;
  if (!rhs.ok) return rhs;
  if (node.op === "/") {
    if (toNumber(rhs.value) === 0)
      return {
        ok: false,
        error: divisionByZero(input, "division by zero", node.span),
      };
    return {
      ok: true,
      value: {
        type: "number",
        value: toNumber(lhs.value) / toNumber(rhs.value),
      },
    };
  }
  const a = toNumber(lhs.value);
  const b = toNumber(rhs.value);
  const value = node.op === "+" ? a + b : node.op === "-" ? a - b : a * b;
  return { ok: true, value: { type: "number", value } };
}

function evalUnary(
  node: Extract<Node, { type: "unary" }>,
  env: Env,
  input: string,
): EvalOutcome {
  const operand = evalNode(node.operand, env, input);
  if (isBreak(operand)) return operand;
  if (!operand.ok) return operand;
  if (node.op === "!")
    return {
      ok: true,
      value: { type: "bool", value: toNumber(operand.value) === 0 },
    };
  return {
    ok: true,
    value: { type: "number", value: -toNumber(operand.value) },
  };
}

const compareOps: Record<
  Extract<Node, { type: "compare" }>["op"],
  (a: Value, b: Value) => boolean
> = {
  "==": (a, b) => valuesEqual(a, b),
  "!=": (a, b) => !valuesEqual(a, b),
  ">": (a, b) => toNumber(a) > toNumber(b),
  ">=": (a, b) => toNumber(a) >= toNumber(b),
  "<": (a, b) => toNumber(a) < toNumber(b),
  "<=": (a, b) => toNumber(a) <= toNumber(b),
};

function evalShortCircuit(
  node: Extract<Node, { type: "logical" }>,
  env: Env,
  input: string,
): EvalOutcome {
  const lhs = evalNode(node.lhs, env, input);
  if (isBreak(lhs)) return lhs;
  if (!lhs.ok) return lhs;
  const truthy = toNumber(lhs.value) !== 0;
  if (node.op === "||" && truthy)
    return { ok: true, value: { type: "bool", value: true } };
  if (node.op === "&&" && !truthy)
    return { ok: true, value: { type: "bool", value: false } };
  const rhs = evalNode(node.rhs, env, input);
  if (isBreak(rhs)) return rhs;
  if (!rhs.ok) return rhs;
  return {
    ok: true,
    value: { type: "bool", value: toNumber(rhs.value) !== 0 },
  };
}

function evalBinding(
  node: Extract<Node, { type: "let" | "assign" }>,
  env: Env,
  input: string,
): EvalOutcome {
  const fail = (reason: string): Result<Value, EvalError> => ({
    ok: false,
    error: invalidInput(input, reason, node.span),
  });
  if (node.type === "assign" && !isMutable(env, node.name))
    return fail(`cannot reassign immutable: ${node.name}`);
  const value = evalNode(node.value, env, input);
  if (isBreak(value)) return value;
  if (!value.ok) return value;
  const existing = lookup(env, node.name);
  if (existing !== undefined && existing.type !== value.value.type)
    return fail(
      `type mismatch: cannot assign ${value.value.type} to ${existing.type} variable: ${node.name}`,
    );
  const frame =
    node.type === "let" ? env : (assignFrame(env, node.name) ?? env);
  frame.values[node.name] = value.value;
  if (node.type === "let" && node.mutable) frame.mutable.add(node.name);
  return { ok: true, value: { type: "number", value: 0 } };
}

function evalNode(node: Node, env: Env, input: string): EvalOutcome {
  const fail = (reason: string): Result<Value, EvalError> => ({
    ok: false,
    error: invalidInput(input, reason, node.span),
  });
  switch (node.type) {
    case "number":
      return { ok: true, value: { type: "number", value: node.value } };
    case "bool":
      return { ok: true, value: { type: "bool", value: node.value } };
    case "var": {
      const bound = lookup(env, node.name);
      if (bound === undefined) return fail(`unbound variable: ${node.name}`);
      return { ok: true, value: bound };
    }
    case "binary":
      return evalArithmetic(node, env, input);
    case "unary":
      return evalUnary(node, env, input);
    case "compare":
      return evalBinaryBool(
        node.lhs,
        node.rhs,
        env,
        input,
        compareOps[node.op],
      );
    case "logical":
      return evalShortCircuit(node, env, input);
    case "let":
    case "assign":
      return evalBinding(node, env, input);
    case "if": {
      const cond = evalNode(node.cond, env, input);
      if (isBreak(cond)) return cond;
      if (!cond.ok) return cond;
      const branch = toNumber(cond.value) !== 0 ? node.then : node.else;
      return evalNode(branch, env, input);
    }
    case "block": {
      const scope: Env = node.inExpression
        ? { values: { ...env.values }, mutable: new Set(env.mutable) }
        : env;
      let value: Value = { type: "number", value: 0 };
      for (const statement of node.statements) {
        const s = evalNode(statement, scope, input);
        if (isBreak(s)) return s;
        if (!s.ok) return s;
        value = s.value;
      }
      return { ok: true, value };
    }
    case "loop": {
      const body: Env = { values: {}, mutable: new Set(), parent: env };
      while (true) {
        const s = evalNode(node.body, body, input);
        if (isBreak(s)) return { ok: true, value: s.break };
        if (!s.ok) return s;
      }
    }
    case "break": {
      const value = evalNode(node.value, env, input);
      if (isBreak(value)) return value;
      if (!value.ok) return value;
      return { break: value.value };
    }
  }
}

export function evaluateAst(
  statements: Node[],
  input: string,
): Result<number, EvalError> {
  const env: Env = { values: {}, mutable: new Set<string>() };
  let value: Value = { type: "number", value: 0 };
  for (const statement of statements) {
    const s = evalNode(statement, env, input);
    if (isBreak(s))
      return {
        ok: false,
        error: invalidInput(input, "break outside of a loop", statement.span),
      };
    if (!s.ok) return s;
    value = s.value;
  }
  return { ok: true, value: Math.trunc(toNumber(value)) };
}
