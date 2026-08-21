export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type EvalError =
  | { kind: "invalid-token"; index: number; token: string }
  | { kind: "unexpected-end"; index: number }
  | { kind: "unbalanced-paren"; index: number }
  | { kind: "unknown-variable"; index: number; name: string };

const NUMBER_RE = /^\d+(\.\d+)?$/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

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
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_]/.test(input.charAt(j))) j++;
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
  const scopes: Map<string, number>[] = [new Map()];

  function lookup(
    name: string,
    index: number,
  ): Result<number, EvalError> {
    for (let s = scopes.length - 1; s >= 0; s--) {
      const value = scopes[s]?.get(name);
      if (value !== undefined) return { ok: true, value };
    }
    return {
      ok: false,
      error: { kind: "unknown-variable", index, name },
    };
  }

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

  // factor := ("-" | "+")? (number | ident | "(" expr ")" | "{" block "}")
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
    if (token.value === "(") {
      pos++;
      const inner = parseExpr();
      if (!inner.ok) return inner;
      const close = tokens[pos];
      if (close === undefined || close.value !== ")") {
        return {
          ok: false,
          error: { kind: "unbalanced-paren", index: token.index },
        };
      }
      pos++;
      return { ok: true, value: sign * inner.value };
    }
    if (token.value === "{") {
      const block = parseBlock();
      if (!block.ok) return block;
      return { ok: true, value: sign * block.value };
    }
    if (IDENT_RE.test(token.value)) {
      if (token.value === "let") {
        return {
          ok: false,
          error: {
            kind: "invalid-token",
            index: token.index,
            token: token.value,
          },
        };
      }
      const found = lookup(token.value, token.index);
      if (!found.ok) return found;
      pos++;
      return { ok: true, value: sign * found.value };
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

  // block := "{" (letDecl ";")* expr "}"
  // letDecl := "let" ident "=" expr
  function parseBlock(): Result<number, EvalError> {
    pos++; // consume "{" (checked by caller)
    const scope = new Map<string, number>();
    scopes.push(scope);
    let value: Result<number, EvalError> | undefined;
    for (;;) {
      const t = tokens[pos];
      if (t === undefined || t.value === "}") {
        if (value === undefined) {
          return {
            ok: false,
            error: {
              kind: "unexpected-end",
              index: t?.index ?? input.trimEnd().length,
            },
          };
        }
        pos++;
        scopes.pop();
        return value;
      }
      if (t.value === "let") {
        pos++;
        const name = tokens[pos];
        if (
          name === undefined ||
          !IDENT_RE.test(name.value) ||
          name.value === "let"
        ) {
          return {
            ok: false,
            error: {
              kind: "invalid-token",
              index: name?.index ?? t.index,
              token: name?.value ?? "",
            },
          };
        }
        pos++;
        const eq = tokens[pos];
        if (eq === undefined || eq.value !== "=") {
          return {
            ok: false,
            error: {
              kind: "invalid-token",
              index: eq?.index ?? name.index,
              token: eq?.value ?? "",
            },
          };
        }
        pos++;
        const v = parseExpr();
        if (!v.ok) return v;
        const semi = tokens[pos];
        if (semi === undefined || semi.value !== ";") {
          return {
            ok: false,
            error: {
              kind: "invalid-token",
              index: semi?.index ?? eq.index,
              token: semi?.value ?? "",
            },
          };
        }
        pos++;
        scope.set(name.value, v.value);
        continue;
      }
      const v = parseExpr();
      if (!v.ok) return v;
      value = v;
    }
  }

  // expr := term (("+" | "-") term)*
  function parseExpr(): Result<number, EvalError> {
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
    return result;
  }

  const result = parseExpr();
  if (!result.ok) return result;

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
