export type EvalError = {
  kind: "invalid_input";
  input: string;
  reason: string;
  hint: string;
};

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function tokenize(input: string): string[] {
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
    if ("+-*()".includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }
    throw new Error(`unexpected character: ${c}`);
  }
  return tokens;
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
  let tokens: string[];
  try {
    tokens = tokenize(input);
  } catch (e) {
    return fail((e as Error).message);
  }
  let pos = 0;
  const peek = (): string | undefined => tokens[pos];
  const parseExpr = (): number => {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = tokens[pos++];
      const rhs = parseTerm();
      value = op === "-" ? value - rhs : value + rhs;
    }
    return value;
  };
  const parseTerm = (): number => {
    let value = parseFactor();
    while (peek() === "*") {
      pos++;
      value *= parseFactor();
    }
    return value;
  };
  const parseFactor = (): number => {
    const t = peek();
    if (t === "(") {
      pos++;
      const value = parseExpr();
      if (peek() !== ")") throw new Error("expected )");
      pos++;
      return value;
    }
    if (t === undefined) throw new Error("unexpected end of input");
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error(`not a number: ${t}`);
    pos++;
    return n;
  };
  try {
    const value = parseExpr();
    if (pos < tokens.length) return fail(`unexpected token: ${tokens[pos]}`);
    return { ok: true, value };
  } catch (e) {
    return fail((e as Error).message);
  }
}
