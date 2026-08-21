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

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function tokenize(input: string): Result<string[], { reason: string }> {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input.charAt(i);
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input.charAt(j))) j++;
      tokens.push(input.slice(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input.charAt(j))) j++;
      tokens.push(input.slice(i, j));
      i = j;
      continue;
    }
    if (c === "=" && input.charAt(i + 1) === "=") {
      tokens.push("==");
      i += 2;
      continue;
    }
    if ("+-*/(){};=".includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }
    return { ok: false, error: { reason: `unexpected character: ${c}` } };
  }
  return { ok: true, value: tokens };
}

type ParserState = {
  tokens: string[];
  pos: number;
  env: Record<string, number>;
  mutable: Set<string>;
  fail: (reason: string) => Result<number, EvalError>;
  failDivisionByZero: (reason: string) => Result<number, EvalError>;
};

function makeFail(input: string) {
  return (reason: string): Result<number, EvalError> => ({
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
  return (reason: string): Result<number, EvalError> => ({
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

function parseComparison(state: ParserState): Result<number, EvalError> {
  const lhs = parseExpr(state);
  if (!lhs.ok) return lhs;
  let value = lhs.value;
  while (state.tokens[state.pos] === "==") {
    state.pos++;
    const rhs = parseExpr(state);
    if (!rhs.ok) return rhs;
    value = value === rhs.value ? 1 : 0;
  }
  return { ok: true, value };
}

function parseExpr(state: ParserState): Result<number, EvalError> {
  const lhs = parseTerm(state);
  if (!lhs.ok) return lhs;
  let value = lhs.value;
  while (state.tokens[state.pos] === "+" || state.tokens[state.pos] === "-") {
    const op = state.tokens[state.pos++];
    const rhs = parseTerm(state);
    if (!rhs.ok) return rhs;
    value = op === "-" ? value - rhs.value : value + rhs.value;
  }
  return { ok: true, value };
}

function parseLetBinding(state: ParserState): Result<number, EvalError> {
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
    return { ok: true, value: 0 };
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
  return { ok: true, value: 0 };
}

function parseStatement(state: ParserState): Result<number, EvalError> {
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
    return { ok: true, value: 0 };
  }
  return parseComparison(state);
}

function parseStatements(state: ParserState): Result<number, EvalError> {
  let value = 0;
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

function parseTerm(state: ParserState): Result<number, EvalError> {
  const lhs = parseFactor(state);
  if (!lhs.ok) return lhs;
  let value = lhs.value;
  while (state.tokens[state.pos] === "*" || state.tokens[state.pos] === "/") {
    const op = state.tokens[state.pos++];
    const rhs = parseFactor(state);
    if (!rhs.ok) return rhs;
    if (op === "/") {
      if (rhs.value === 0) return state.failDivisionByZero("division by zero");
      value = Math.trunc(value / rhs.value);
    } else {
      value = value * rhs.value;
    }
  }
  return { ok: true, value };
}

function parseFactor(state: ParserState): Result<number, EvalError> {
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
    return { ok: true, value: 1 };
  }
  if (t === "false") {
    state.pos++;
    return { ok: true, value: 0 };
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
  return { ok: true, value: n };
}

export function evaluate(input: string): Result<number, EvalError> {
  const fail = makeFail(input);
  if (input.trim() === "") return { ok: true, value: 0 };
  const tokenized = tokenize(input);
  if (!tokenized.ok) return fail(tokenized.error.reason);
  const state = makeState(input, tokenized.value);
  const statements = parseStatements(state);
  if (!statements.ok) return statements;
  if (state.pos < state.tokens.length)
    return fail(`unexpected token: ${state.tokens[state.pos] ?? ""}`);
  return { ok: true, value: statements.value };
}
