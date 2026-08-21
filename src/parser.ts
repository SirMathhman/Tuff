export type EvalError =
  | {
      kind: "invalid_input";
      input: string;
      reason: string;
      hint: string;
    }
  | {
      kind: "division_by_zero";
      input: string;
      reason: string;
      hint: string;
    };

import { tokenize } from "./tokenizer.ts";

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

type Value =
  | { type: "number"; value: number }
  | { type: "bool"; value: boolean };

function toNumber(v: Value): number {
  return v.type === "number" ? v.value : v.value ? 1 : 0;
}

type ParserState = {
  tokens: string[];
  pos: number;
  env: Record<string, Value>;
  mutable: Set<string>;
  fail: (reason: string) => Result<Value, EvalError>;
  failDivisionByZero: (reason: string) => Result<Value, EvalError>;
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

function makeState(input: string, tokens: string[]): ParserState {
  return {
    tokens,
    pos: 0,
    env: {},
    mutable: new Set<string>(),
    fail: makeFail(input),
    failDivisionByZero: makeFailDivisionByZero(input),
  };
}

function valuesEqual(a: Value, b: Value): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "number") return a.value === b.value;
  return a.value === b.value;
}

function parseComparison(state: ParserState): Result<Value, EvalError> {
  const lhs = parseExpr(state);
  if (!lhs.ok) return lhs;
  let value: Value = lhs.value;
  while (state.tokens[state.pos] === "==") {
    state.pos++;
    const rhs = parseExpr(state);
    if (!rhs.ok) return rhs;
    value = { type: "bool", value: valuesEqual(value, rhs.value) };
  }
  return { ok: true, value };
}

function parseExpr(state: ParserState): Result<Value, EvalError> {
  const lhs = parseTerm(state);
  if (!lhs.ok) return lhs;
  if (state.tokens[state.pos] !== "+" && state.tokens[state.pos] !== "-")
    return { ok: true, value: lhs.value };
  let value = toNumber(lhs.value);
  while (state.tokens[state.pos] === "+" || state.tokens[state.pos] === "-") {
    const op = state.tokens[state.pos++];
    const rhs = parseTerm(state);
    if (!rhs.ok) return rhs;
    value =
      op === "-" ? value - toNumber(rhs.value) : value + toNumber(rhs.value);
  }
  return { ok: true, value: { type: "number", value } };
}

function parseLetBinding(state: ParserState): Result<Value, EvalError> {
  state.pos++;
  if (state.tokens[state.pos] === "mut") {
    state.pos++;
    const name = state.tokens[state.pos];
    if (name === undefined || name === ";")
      return state.fail("expected identifier");
    state.pos++;
    if (state.tokens[state.pos] !== "=") return state.fail("expected =");
    state.pos++;
    const value = parseExpr(state);
    if (!value.ok) return value;
    state.env[name] = value.value;
    state.mutable.add(name);
    if (state.tokens[state.pos] !== ";") return state.fail("expected ;");
    state.pos++;
    return { ok: true, value: { type: "number", value: 0 } };
  }
  const name = state.tokens[state.pos];
  if (name === undefined || name === ";")
    return state.fail("expected identifier");
  state.pos++;
  if (state.tokens[state.pos] !== "=") return state.fail("expected =");
  state.pos++;
  const value = parseExpr(state);
  if (!value.ok) return value;
  state.env[name] = value.value;
  if (state.tokens[state.pos] !== ";") return state.fail("expected ;");
  state.pos++;
  return { ok: true, value: { type: "number", value: 0 } };
}

function parseStatement(state: ParserState): Result<Value, EvalError> {
  if (state.tokens[state.pos] === "let") return parseLetBinding(state);
  const name = state.tokens[state.pos];
  if (name !== undefined && state.tokens[state.pos + 1] === "=") {
    if (!state.mutable.has(name))
      return state.fail(`cannot reassign immutable: ${name}`);
    state.pos += 2;
    const value = parseExpr(state);
    if (!value.ok) return value;
    state.env[name] = value.value;
    if (state.tokens[state.pos] !== ";") return state.fail("expected ;");
    state.pos++;
    return { ok: true, value: { type: "number", value: 0 } };
  }
  return parseComparison(state);
}

function parseStatements(state: ParserState): Result<Value, EvalError> {
  let value: Value = { type: "number", value: 0 };
  while (
    state.tokens[state.pos] !== undefined &&
    state.tokens[state.pos] !== "}"
  ) {
    const s = parseStatement(state);
    if (!s.ok) return s;
    value = s.value;
  }
  return { ok: true, value };
}

function parseTerm(state: ParserState): Result<Value, EvalError> {
  const lhs = parseFactor(state);
  if (!lhs.ok) return lhs;
  if (state.tokens[state.pos] !== "*" && state.tokens[state.pos] !== "/")
    return { ok: true, value: lhs.value };
  let value = toNumber(lhs.value);
  while (state.tokens[state.pos] === "*" || state.tokens[state.pos] === "/") {
    const op = state.tokens[state.pos++];
    const rhs = parseFactor(state);
    if (!rhs.ok) return rhs;
    if (op === "/") {
      if (toNumber(rhs.value) === 0)
        return state.failDivisionByZero("division by zero");
      value = Math.trunc(value / toNumber(rhs.value));
    } else {
      value = value * toNumber(rhs.value);
    }
  }
  return { ok: true, value: { type: "number", value } };
}

function parseFactor(state: ParserState): Result<Value, EvalError> {
  const t = state.tokens[state.pos];
  if (t === "(") {
    state.pos++;
    const value = parseExpr(state);
    if (!value.ok) return value;
    if (state.tokens[state.pos] !== ")") return state.fail("expected )");
    state.pos++;
    return { ok: true, value: value.value };
  }
  if (t === "{") {
    state.pos++;
    const block: ParserState = {
      tokens: state.tokens,
      pos: state.pos,
      env: { ...state.env },
      mutable: new Set(state.mutable),
      fail: state.fail,
      failDivisionByZero: state.failDivisionByZero,
    };
    const statements = parseStatements(block);
    if (!statements.ok) return statements;
    if (block.tokens[block.pos] !== "}") return block.fail("expected }");
    state.pos = block.pos + 1;
    return { ok: true, value: statements.value };
  }
  if (t === undefined) return state.fail("unexpected end of input");
  if (t === "true") {
    state.pos++;
    return { ok: true, value: { type: "bool", value: true } };
  }
  if (t === "false") {
    state.pos++;
    return { ok: true, value: { type: "bool", value: false } };
  }
  if (t in state.env) {
    state.pos++;
    const bound = state.env[t];
    if (bound === undefined) return state.fail(`unbound variable: ${t}`);
    return { ok: true, value: bound };
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return state.fail(`not a number: ${t}`);
  state.pos++;
  return { ok: true, value: { type: "number", value: n } };
}

export function evaluate(input: string): Result<number, EvalError> {
  const fail = (reason: string): Result<number, EvalError> => ({
    ok: false,
    error: {
      kind: "invalid_input",
      input,
      reason,
      hint: 'pass a valid arithmetic expression, e.g. "1 + 2 * 3"',
    },
  });
  if (input.trim() === "") return { ok: true, value: 0 };
  const tokenized = tokenize(input);
  if (!tokenized.ok) return fail(tokenized.error.reason);
  const state = makeState(input, tokenized.value);
  const statements = parseStatements(state);
  if (!statements.ok) return statements;
  if (state.pos < state.tokens.length)
    return fail(`unexpected token: ${state.tokens[state.pos] ?? ""}`);
  return { ok: true, value: toNumber(statements.value) };
}
