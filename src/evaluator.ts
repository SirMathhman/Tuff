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
};

class BreakSignal {
  constructor(public readonly value: Value) {}
}

function evalBinaryBool(
  lhs: Node,
  rhs: Node,
  env: Env,
  input: string,
  combine: (a: Value, b: Value) => boolean,
): Result<Value, EvalError> {
  const l = evalNode(lhs, env, input);
  if (!l.ok) return l;
  const r = evalNode(rhs, env, input);
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
): Result<Value, EvalError> {
  const lhs = evalNode(node.lhs, env, input);
  if (!lhs.ok) return lhs;
  const rhs = evalNode(node.rhs, env, input);
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
): Result<Value, EvalError> {
  const operand = evalNode(node.operand, env, input);
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
): Result<Value, EvalError> {
  const lhs = evalNode(node.lhs, env, input);
  if (!lhs.ok) return lhs;
  const truthy = toNumber(lhs.value) !== 0;
  if (node.op === "||" && truthy)
    return { ok: true, value: { type: "bool", value: true } };
  if (node.op === "&&" && !truthy)
    return { ok: true, value: { type: "bool", value: false } };
  const rhs = evalNode(node.rhs, env, input);
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
): Result<Value, EvalError> {
  const fail = (reason: string): Result<Value, EvalError> => ({
    ok: false,
    error: invalidInput(input, reason, node.span),
  });
  if (node.type === "assign" && !env.mutable.has(node.name))
    return fail(`cannot reassign immutable: ${node.name}`);
  const value = evalNode(node.value, env, input);
  if (!value.ok) return value;
  const existing = env.values[node.name];
  if (existing !== undefined && existing.type !== value.value.type)
    return fail(
      `type mismatch: cannot assign ${value.value.type} to ${existing.type} variable: ${node.name}`,
    );
  env.values[node.name] = value.value;
  if (node.type === "let" && node.mutable) env.mutable.add(node.name);
  return { ok: true, value: { type: "number", value: 0 } };
}

function evalNode(
  node: Node,
  env: Env,
  input: string,
): Result<Value, EvalError> {
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
      const bound = env.values[node.name];
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
      if (!cond.ok) return cond;
      const branch = toNumber(cond.value) !== 0 ? node.then : node.else;
      return evalNode(branch, env, input);
    }
    case "block": {
      const child: Env = {
        values: { ...env.values },
        mutable: new Set(env.mutable),
      };
      let value: Value = { type: "number", value: 0 };
      for (const statement of node.statements) {
        const s = evalNode(statement, child, input);
        if (!s.ok) return s;
        value = s.value;
      }
      return { ok: true, value };
    }
    case "loop": {
      while (true) {
        try {
          const s = evalNode(node.body, env, input);
          if (!s.ok) return s;
        } catch (e) {
          if (e instanceof BreakSignal)
            return { ok: true, value: e.value };
          throw e;
        }
      }
    }
    case "break": {
      const value = evalNode(node.value, env, input);
      if (!value.ok) return value;
      throw new BreakSignal(value.value);
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
    if (!s.ok) return s;
    value = s.value;
  }
  return { ok: true, value: Math.trunc(toNumber(value)) };
}
