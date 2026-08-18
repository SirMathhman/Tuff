export type EvalOutcome =
  | { readonly ok: true; readonly value: number }
  | {
      readonly ok: false;
      readonly reason: "NotANumber" | "InvalidExpression";
    };

interface Token {
  readonly kind: "number" | "operator" | "lparen" | "rparen";
  readonly value: string;
}

type TokenizeResult =
  | { readonly ok: true; readonly tokens: Token[] }
  | { readonly ok: false; readonly reason: "NotANumber" | "InvalidExpression" };

function tokenize(source: string): TokenizeResult {
  const chars = Array.from(source);
  const tokens: Token[] = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i]!;
    if (ch === " ") {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen", value: ch });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen", value: ch });
      i++;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "operator", value: ch });
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < chars.length && /[0-9.]/.test(chars[j]!)) {
        j++;
      }
      const numText = chars.slice(i, j).join("");
      if (!Number.isFinite(Number(numText))) {
        return { ok: false, reason: "NotANumber" };
      }
      tokens.push({ kind: "number", value: numText });
      i = j;
      continue;
    }
    return { ok: false, reason: "NotANumber" };
  }
  return { ok: true, tokens };
}

type ParseResult =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: "InvalidExpression" };

const invalid: ParseResult = { ok: false, reason: "InvalidExpression" };

function parseExpr(tokens: Token[], pos: { i: number }): ParseResult {
  let acc = parseTerm(tokens, pos);
  if (!acc.ok) {
    return acc;
  }
  while (pos.i < tokens.length) {
    const t = tokens[pos.i]!;
    if (t.kind !== "operator" || (t.value !== "+" && t.value !== "-")) {
      break;
    }
    pos.i++;
    const right = parseTerm(tokens, pos);
    if (!right.ok) {
      return right;
    }
    acc = {
      ok: true,
      value:
        t.value === "+" ? acc.value + right.value : acc.value - right.value,
    };
  }
  return acc;
}

function parseTerm(tokens: Token[], pos: { i: number }): ParseResult {
  let acc = parseFactor(tokens, pos);
  if (!acc.ok) {
    return acc;
  }
  while (pos.i < tokens.length) {
    const t = tokens[pos.i]!;
    if (t.kind !== "operator" || (t.value !== "*" && t.value !== "/")) {
      break;
    }
    pos.i++;
    const right = parseFactor(tokens, pos);
    if (!right.ok) {
      return right;
    }
    const value: number =
      t.value === "*" ? acc.value * right.value : acc.value / right.value;
    if (!Number.isFinite(value)) {
      return invalid;
    }
    acc = { ok: true, value };
  }
  return acc;
}

function parseFactor(tokens: Token[], pos: { i: number }): ParseResult {
  if (pos.i >= tokens.length) {
    return invalid;
  }
  const t = tokens[pos.i]!;
  if (t.kind === "operator" && (t.value === "+" || t.value === "-")) {
    pos.i++;
    const inner = parseFactor(tokens, pos);
    if (!inner.ok) {
      return inner;
    }
    return { ok: true, value: t.value === "+" ? inner.value : -inner.value };
  }
  if (t.kind === "lparen") {
    pos.i++;
    const inner = parseExpr(tokens, pos);
    if (!inner.ok) {
      return inner;
    }
    if (pos.i >= tokens.length || tokens[pos.i]!.kind !== "rparen") {
      return invalid;
    }
    pos.i++;
    return inner;
  }
  if (t.kind === "number") {
    pos.i++;
    return { ok: true, value: Number(t.value) };
  }
  return invalid;
}

export function evaluateExpression(source: string): EvalOutcome {
  const tokens = tokenize(source);
  if (!tokens.ok) {
    return tokens;
  }
  const pos = { i: 0 };
  const result = parseExpr(tokens.tokens, pos);
  if (!result.ok || pos.i !== tokens.tokens.length) {
    return { ok: false, reason: "InvalidExpression" };
  }
  return result;
}
