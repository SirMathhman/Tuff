export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type EvalError =
  | { kind: "invalid-token"; index: number; token: string }
  | { kind: "unexpected-end"; index: number };

const NUMBER_RE = /^\d+(\.\d+)?$/;

type Token = { value: string; index: number };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (ch === "+" || ch === "-" || ch === "*") {
      tokens.push({ value: ch, index: i });
      i++;
    } else if (/\d/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[\d.]/.test(input.charAt(j))) j++;
      tokens.push({ value: input.slice(i, j), index: i });
      i = j;
    } else if (/\s/.test(ch)) {
      i++;
    } else {
      tokens.push({ value: ch, index: i });
      i++;
    }
  }
  return tokens;
}

export function evaluate(input: string): Result<number, EvalError> {
  if (input === "") return { ok: true, value: 0 };

  const tokens = tokenize(input);
  let pos = 0;

  // term := factor ("*" factor)*
  function parseTerm(): Result<number, EvalError> {
    let left = parseFactor();
    if (!left.ok) return left;
    while (tokens[pos]?.value === "*") {
      pos++;
      const right = parseFactor();
      if (!right.ok) return right;
      left = { ok: true, value: left.value * right.value };
    }
    return left;
  }

  // factor := ("-" | "+")? number
  function parseFactor(): Result<number, EvalError> {
    let sign = 1;
    const signToken = tokens[pos];
    if (
      signToken !== undefined &&
      (signToken.value === "-" || signToken.value === "+")
    ) {
      sign = signToken.value === "-" ? -1 : 1;
      pos++;
    }
    const token = tokens[pos];
    if (token === undefined) {
      return {
        ok: false,
        error: { kind: "unexpected-end", index: input.trimEnd().length },
      };
    }
    if (!NUMBER_RE.test(token.value)) {
      return {
        ok: false,
        error: {
          kind: "invalid-token",
          index: token.index,
          token: token.value,
        },
      };
    }
    pos++;
    return { ok: true, value: sign * Number(token.value) };
  }

  // expr := term (("+" | "-") term)*
  let result = parseTerm();
  if (!result.ok) return result;
  while (tokens[pos]?.value === "+" || tokens[pos]?.value === "-") {
    const op = tokens[pos]?.value;
    pos++;
    const right = parseTerm();
    if (!right.ok) return right;
    result = {
      ok: true,
      value:
        op === "+" ? result.value + right.value : result.value - right.value,
    };
  }

  const leftover = tokens[pos];
  if (leftover !== undefined) {
    return {
      ok: false,
      error: {
        kind: "invalid-token",
        index: leftover.index,
        token: leftover.value,
      },
    };
  }

  return result;
}
