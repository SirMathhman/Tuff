export type EvalError = {
  kind: "invalid_input";
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
    if ("+-*/(){};=".includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }
    return { ok: false, error: { reason: `unexpected character: ${c}` } };
  }
  return { ok: true, value: tokens };
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
  const tokens = tokenized.value;
  let pos = 0;
  const env: Record<string, number> = {};
  const mutable = new Set<string>();
  const peek = (): string | undefined => tokens[pos];
  const parseExpr = (): Result<number, EvalError> => {
    const lhs = parseTerm();
    if (!lhs.ok) return lhs;
    let value = lhs.value;
    while (peek() === "+" || peek() === "-") {
      const op = tokens[pos++];
      const rhs = parseTerm();
      if (!rhs.ok) return rhs;
      value = op === "-" ? value - rhs.value : value + rhs.value;
    }
    return { ok: true, value };
  };
  const parseLetBinding = (): Result<number, EvalError> => {
    pos++;
    if (peek() === "mut") {
      pos++;
      const name = peek();
      if (name === undefined || name === ";")
        return fail("expected identifier");
      pos++;
      if (peek() !== "=") return fail("expected =");
      pos++;
      const value = parseExpr();
      if (!value.ok) return value;
      env[name] = value.value;
      mutable.add(name);
      if (peek() !== ";") return fail("expected ;");
      pos++;
      return { ok: true, value: 0 };
    }
    const name = peek();
    if (name === undefined || name === ";") return fail("expected identifier");
    pos++;
    if (peek() !== "=") return fail("expected =");
    pos++;
    const value = parseExpr();
    if (!value.ok) return value;
    env[name] = value.value;
    if (peek() !== ";") return fail("expected ;");
    pos++;
    return { ok: true, value: 0 };
  };
  const parseStatement = (): Result<number, EvalError> => {
    if (peek() === "let") return parseLetBinding();
    const name = peek();
    if (name !== undefined && tokens[pos + 1] === "=") {
      if (!mutable.has(name)) return fail(`cannot reassign immutable: ${name}`);
      pos += 2;
      const value = parseExpr();
      if (!value.ok) return value;
      env[name] = value.value;
      if (peek() !== ";") return fail("expected ;");
      pos++;
      return { ok: true, value: 0 };
    }
    return parseExpr();
  };
  const parseStatements = (): Result<number, EvalError> => {
    let value = 0;
    while (peek() !== undefined && peek() !== "}") {
      const s = parseStatement();
      if (!s.ok) return s;
      value = s.value;
    }
    return { ok: true, value };
  };
  const parseTerm = (): Result<number, EvalError> => {
    const lhs = parseFactor();
    if (!lhs.ok) return lhs;
    let value = lhs.value;
    while (peek() === "*" || peek() === "/") {
      const op = tokens[pos++];
      const rhs = parseFactor();
      if (!rhs.ok) return rhs;
      value = op === "/" ? Math.trunc(value / rhs.value) : value * rhs.value;
    }
    return { ok: true, value };
  };
  const parseFactor = (): Result<number, EvalError> => {
    const t = peek();
    if (t === "(") {
      pos++;
      const value = parseExpr();
      if (!value.ok) return value;
      if (peek() !== ")") return fail("expected )");
      pos++;
      return { ok: true, value: value.value };
    }
    if (t === "{") {
      pos++;
      const statements = parseStatements();
      if (!statements.ok) return statements;
      if (peek() !== "}") return fail("expected }");
      pos++;
      return { ok: true, value: statements.value };
    }
    if (t === undefined) return fail("unexpected end of input");
    if (t in env) {
      pos++;
      const bound = env[t];
      if (bound === undefined) return fail(`unbound variable: ${t}`);
      return { ok: true, value: bound };
    }
    const n = Number(t);
    if (!Number.isFinite(n)) return fail(`not a number: ${t}`);
    pos++;
    return { ok: true, value: n };
  };
  const statements = parseStatements();
  if (!statements.ok) return statements;
  if (pos < tokens.length)
    return fail(`unexpected token: ${tokens[pos] ?? ""}`);
  return { ok: true, value: statements.value };
}
