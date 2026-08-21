import type { Node } from "./ast.ts";
import type { EvalError } from "./errors.ts";
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

function makeFail(input: string) {
  return (reason: string): Result<Value, EvalError> => ({
    ok: false,
    error: {
      kind: "invalid_input",
      input,
      reason,
      hint: 'pass a valid arithmetic expression, e.g. "1 + 2 * 3"',
    },
  });
}

function makeFailDivisionByZero(input: string) {
  return (reason: string): Result<Value, EvalError> => ({
    ok: false,
    error: {
      kind: "division_by_zero",
      input,
      reason,
      hint: "the divisor evaluates to 0; check the right-hand side of /",
    },
  });
}

function evalNode(
  node: Node,
  env: Env,
  input: string,
): Result<Value, EvalError> {
  const fail = makeFail(input);
  const failDivisionByZero = makeFailDivisionByZero(input);
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
    case "binary": {
      const lhs = evalNode(node.lhs, env, input);
      if (!lhs.ok) return lhs;
      const rhs = evalNode(node.rhs, env, input);
      if (!rhs.ok) return rhs;
      if (node.op === "/") {
        if (toNumber(rhs.value) === 0)
          return failDivisionByZero("division by zero");
        return {
          ok: true,
          value: {
            type: "number",
            value: Math.trunc(toNumber(lhs.value) / toNumber(rhs.value)),
          },
        };
      }
      const a = toNumber(lhs.value);
      const b = toNumber(rhs.value);
      const value =
        node.op === "+"
          ? a + b
          : node.op === "-"
            ? a - b
            : node.op === "*"
              ? a * b
              : a / b;
      return { ok: true, value: { type: "number", value } };
    }
    case "unary": {
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
    case "compare": {
      const lhs = evalNode(node.lhs, env, input);
      if (!lhs.ok) return lhs;
      const rhs = evalNode(node.rhs, env, input);
      if (!rhs.ok) return rhs;
      return {
        ok: true,
        value: { type: "bool", value: valuesEqual(lhs.value, rhs.value) },
      };
    }
    case "greater": {
      const lhs = evalNode(node.lhs, env, input);
      if (!lhs.ok) return lhs;
      const rhs = evalNode(node.rhs, env, input);
      if (!rhs.ok) return rhs;
      return {
        ok: true,
        value: {
          type: "bool",
          value: toNumber(lhs.value) > toNumber(rhs.value),
        },
      };
    }
    case "greaterEq": {
      const lhs = evalNode(node.lhs, env, input);
      if (!lhs.ok) return lhs;
      const rhs = evalNode(node.rhs, env, input);
      if (!rhs.ok) return rhs;
      return {
        ok: true,
        value: {
          type: "bool",
          value: toNumber(lhs.value) >= toNumber(rhs.value),
        },
      };
    }
    case "less": {
      const lhs = evalNode(node.lhs, env, input);
      if (!lhs.ok) return lhs;
      const rhs = evalNode(node.rhs, env, input);
      if (!rhs.ok) return rhs;
      return {
        ok: true,
        value: {
          type: "bool",
          value: toNumber(lhs.value) < toNumber(rhs.value),
        },
      };
    }
    case "lessEq": {
      const lhs = evalNode(node.lhs, env, input);
      if (!lhs.ok) return lhs;
      const rhs = evalNode(node.rhs, env, input);
      if (!rhs.ok) return rhs;
      return {
        ok: true,
        value: {
          type: "bool",
          value: toNumber(lhs.value) <= toNumber(rhs.value),
        },
      };
    }
    case "notEqual": {
      const lhs = evalNode(node.lhs, env, input);
      if (!lhs.ok) return lhs;
      const rhs = evalNode(node.rhs, env, input);
      if (!rhs.ok) return rhs;
      return {
        ok: true,
        value: { type: "bool", value: !valuesEqual(lhs.value, rhs.value) },
      };
    }
    case "or": {
      const lhs = evalNode(node.lhs, env, input);
      if (!lhs.ok) return lhs;
      if (toNumber(lhs.value) !== 0)
        return { ok: true, value: { type: "bool", value: true } };
      const rhs = evalNode(node.rhs, env, input);
      if (!rhs.ok) return rhs;
      return {
        ok: true,
        value: { type: "bool", value: toNumber(rhs.value) !== 0 },
      };
    }
    case "and": {
      const lhs = evalNode(node.lhs, env, input);
      if (!lhs.ok) return lhs;
      if (toNumber(lhs.value) === 0)
        return { ok: true, value: { type: "bool", value: false } };
      const rhs = evalNode(node.rhs, env, input);
      if (!rhs.ok) return rhs;
      return {
        ok: true,
        value: { type: "bool", value: toNumber(rhs.value) !== 0 },
      };
    }
    case "let": {
      const value = evalNode(node.value, env, input);
      if (!value.ok) return value;
      env.values[node.name] = value.value;
      if (node.mutable) env.mutable.add(node.name);
      return { ok: true, value: { type: "number", value: 0 } };
    }
    case "assign": {
      if (!env.mutable.has(node.name))
        return fail(`cannot reassign immutable: ${node.name}`);
      const value = evalNode(node.value, env, input);
      if (!value.ok) return value;
      env.values[node.name] = value.value;
      return { ok: true, value: { type: "number", value: 0 } };
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
  return { ok: true, value: toNumber(value) };
}
