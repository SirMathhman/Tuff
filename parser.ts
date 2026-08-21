import type { EvalError, Result, Token } from "./types.ts";

const NUMBER_RE = /^\d+(\.\d+)?$/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type ParserState = {
  tokens: Token[];
  pos: number;
  scopes: Map<string, number>[];
  inputLength: number;
};

function lookup(
  state: ParserState,
  name: string,
  index: number,
): Result<number, EvalError> {
  for (let s = state.scopes.length - 1; s >= 0; s--) {
    const value = state.scopes[s]?.get(name);
    if (value !== undefined) return { ok: true, value };
  }
  return {
    ok: false,
    error: { kind: "unknown-variable", index, name },
  };
}

// term := factor ("*" factor)*
function parseTerm(state: ParserState): Result<number, EvalError> {
  let left = parseFactor(state);
  if (!left.ok) return left;
  while (state.tokens[state.pos]?.value === "*") {
    state.pos++;
    const right = parseFactor(state);
    if (!right.ok) return right;
    left = { ok: true, value: left.value * right.value };
  }
  return left;
}

// factor := ("-" | "+")? (number | ident | "(" expr ")" | "{" block "}")
function parseFactor(state: ParserState): Result<number, EvalError> {
  let sign = 1;
  const signToken = state.tokens[state.pos];
  if (
    signToken !== undefined &&
    (signToken.value === "-" || signToken.value === "+")
  ) {
    sign = signToken.value === "-" ? -1 : 1;
    state.pos++;
  }
  const token = state.tokens[state.pos];
  if (token === undefined) {
    return {
      ok: false,
      error: { kind: "unexpected-end", index: state.inputLength },
    };
  }
  if (token.value === "(") {
    state.pos++;
    const inner = parseExpr(state);
    if (!inner.ok) return inner;
    const close = state.tokens[state.pos];
    if (close === undefined || close.value !== ")") {
      return {
        ok: false,
        error: { kind: "unbalanced-paren", index: token.index },
      };
    }
    state.pos++;
    return { ok: true, value: sign * inner.value };
  }
  if (token.value === "{") {
    const block = parseBlock(state);
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
    const found = lookup(state, token.value, token.index);
    if (!found.ok) return found;
    state.pos++;
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
  state.pos++;
  return { ok: true, value: sign * Number(token.value) };
}

// letDecl := "let" ident "=" expr ";"
function parseLetDecl(
  state: ParserState,
  scope: Map<string, number>,
): Result<number, EvalError> {
  const letTok = state.tokens[state.pos];
  state.pos++; // consume "let" (checked by caller)
  const name = state.tokens[state.pos];
  if (
    name === undefined ||
    !IDENT_RE.test(name.value) ||
    name.value === "let"
  ) {
    return {
      ok: false,
      error: {
        kind: "invalid-token",
        index: name?.index ?? letTok?.index ?? state.inputLength,
        token: name?.value ?? "",
      },
    };
  }
  state.pos++;
  const eq = state.tokens[state.pos];
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
  state.pos++;
  const v = parseExpr(state);
  if (!v.ok) return v;
  const semi = state.tokens[state.pos];
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
  state.pos++;
  scope.set(name.value, v.value);
  return { ok: true, value: v.value };
}

// block := "{" (letDecl ";")* expr "}"
function parseBlock(state: ParserState): Result<number, EvalError> {
  state.pos++; // consume "{" (checked by caller)
  const scope = new Map<string, number>();
  state.scopes.push(scope);
  let value: Result<number, EvalError> | undefined;
  for (;;) {
    const t = state.tokens[state.pos];
    if (t === undefined || t.value === "}") {
      if (value === undefined) {
        return {
          ok: false,
          error: {
            kind: "unexpected-end",
            index: t?.index ?? state.inputLength,
          },
        };
      }
      state.pos++;
      state.scopes.pop();
      return value;
    }
    if (t.value === "let") {
      const decl = parseLetDecl(state, scope);
      if (!decl.ok) return decl;
      continue;
    }
    const v = parseExpr(state);
    if (!v.ok) return v;
    value = v;
  }
}

// expr := term (("+" | "-") term)*
function parseExpr(state: ParserState): Result<number, EvalError> {
  let result = parseTerm(state);
  if (!result.ok) return result;
  while (
    state.tokens[state.pos]?.value === "+" ||
    state.tokens[state.pos]?.value === "-"
  ) {
    const op = state.tokens[state.pos]?.value;
    state.pos++;
    const right = parseTerm(state);
    if (!right.ok) return right;
    result = {
      ok: true,
      value:
        op === "+" ? result.value + right.value : result.value - right.value,
    };
  }
  return result;
}

// program := (letDecl ";")* expr
export function parse(state: ParserState): Result<number, EvalError> {
  const topScope = state.scopes[0] ?? new Map<string, number>();
  while (state.tokens[state.pos]?.value === "let") {
    const decl = parseLetDecl(state, topScope);
    if (!decl.ok) return decl;
  }
  const result = parseExpr(state);
  if (!result.ok) return result;

  const leftover = state.tokens[state.pos];
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
