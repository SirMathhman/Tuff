export type EvalErrorReason = "NotANumber" | "InvalidExpression";

export interface EvalSuccess {
  readonly ok: true;
  readonly value: number;
}

export interface EvalFailure {
  readonly ok: false;
  readonly reason: EvalErrorReason;
  /** 0-based index of the offending character in the evaluated source. */
  readonly position: number;
}

export type EvalOutcome = EvalSuccess | EvalFailure;

interface Token {
  readonly kind: "number" | "operator" | "lparen" | "rparen";
  readonly value: string;
  readonly position: number;
}

interface TokenizeSuccess {
  readonly ok: true;
  readonly tokens: Token[];
}

interface TokenizeFailure {
  readonly ok: false;
  readonly reason: EvalErrorReason;
  readonly position: number;
}

type TokenizeResult = TokenizeSuccess | TokenizeFailure;

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
      tokens.push({ kind: "lparen", value: ch, position: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen", value: ch, position: i });
      i++;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "operator", value: ch, position: i });
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
        return { ok: false, reason: "NotANumber", position: i };
      }
      tokens.push({ kind: "number", value: numText, position: i });
      i = j;
      continue;
    }
    return { ok: false, reason: "NotANumber", position: i };
  }
  return { ok: true, tokens };
}

interface ParseSuccess {
  readonly ok: true;
  readonly value: number;
}

interface ParseFailure {
  readonly ok: false;
  readonly position: number;
}

type ParseResult = ParseSuccess | ParseFailure;

interface Cursor {
  i: number;
}

function failAt(position: number): ParseResult {
  return { ok: false, position };
}

function parseExpr(tokens: Token[], pos: Cursor): ParseResult {
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

function parseTerm(tokens: Token[], pos: Cursor): ParseResult {
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
      return failAt(t.position);
    }
    acc = { ok: true, value };
  }
  return acc;
}

function parseFactor(tokens: Token[], pos: Cursor): ParseResult {
  if (pos.i >= tokens.length) {
    return failAt(tokens.length);
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
      return failAt(
        pos.i < tokens.length ? tokens[pos.i]!.position : t.position,
      );
    }
    pos.i++;
    return inner;
  }
  if (t.kind === "number") {
    pos.i++;
    return { ok: true, value: Number(t.value) };
  }
  return failAt(t.position);
}

export function evaluateExpression(source: string): EvalOutcome {
  const tokens = tokenize(source);
  if (!tokens.ok) {
    return tokens;
  }
  const pos = { i: 0 };
  const result = parseExpr(tokens.tokens, pos);
  if (!result.ok) {
    return {
      ok: false,
      reason: "InvalidExpression",
      position: result.position,
    };
  }
  if (pos.i !== tokens.tokens.length) {
    return {
      ok: false,
      reason: "InvalidExpression",
      position: tokens.tokens[pos.i]!.position,
    };
  }
  return result;
}
