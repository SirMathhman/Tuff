import { parseNumber } from "./parseNumber";
import { Result, ok, err, isOk } from "./result";

export interface NumToken {
  type: "num";
  value: number;
}
export interface OpToken {
  type: "op";
  value: "+" | "-" | "*" | "/" | "%";
}
export interface ParenToken {
  type: "paren";
  value: "(" | ")";
}
export interface IdentToken {
  type: "ident";
  value: string;
}
export interface PunctToken {
  type: "punct";
  value: ":" | "=" | ";" | "{" | "}" | "=>";
}
export type Token = NumToken | OpToken | ParenToken | IdentToken | PunctToken;

function parseAndPushNumber(
  s: string,
  i: number,
  tokens: Token[]
): Result<number, string> {
  const parsed = parseNumber(s, i);
  if (!isOk(parsed)) return err(parsed.error);
  const { value, nextIndex } = parsed.value;
  tokens.push({ type: "num", value });
  return ok(nextIndex);
}

function parseAndPushIdentifier(
  s: string,
  i: number,
  tokens: Token[]
): Result<number, string> {
  const len = s.length;
  let j = i;
  const isStart = (ch: string) => /[A-Za-z_]/.test(ch);
  const isCont = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  if (!isStart(s[j])) return err("Invalid token");
  let ident = "";
  while (j < len && isCont(s[j])) {
    ident += s[j];
    j++;
  }
  tokens.push({ type: "ident", value: ident });
  return ok(j);
}

function handleSignOrOperator(
  s: string,
  i: number,
  ch: string,
  tokens: Token[]
): Result<number, string> {
  const prev = tokens.length ? tokens[tokens.length - 1] : undefined;
  // unary sign if at start, or after an operator, or after an opening paren
  if (
    !prev ||
    prev.type === "op" ||
    (prev.type === "paren" && prev.value === "(")
  ) {
    return parseAndPushNumber(s, i, tokens);
  }
  tokens.push({ type: "op", value: ch as "+" | "-" });
  return ok(i + 1);
}

function handleOperator(
  s: string,
  i: number,
  ch: string,
  tokens: Token[]
): Result<number, string> {
  if (ch === "+" || ch === "-") {
    const res = handleSignOrOperator(s, i, ch, tokens);
    if (!isOk(res)) return err(res.error);
    return ok(res.value);
  }
  tokens.push({ type: "op", value: ch as "+" | "-" | "*" | "/" | "%" });
  return ok(i + 1);
}

function handleChar(
  s: string,
  i: number,
  tokens: Token[]
): Result<number, string> {
  const ch = s[i];
  if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
    return ok(i + 1);
  }
  if ("(){}".includes(ch)) {
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
    } else {
      tokens.push({ type: "punct", value: ch as "{" | "}" });
    }
    return ok(i + 1);
  }
  if ("+-*/%".includes(ch)) {
    const res = handleOperator(s, i, ch, tokens);
    if (!isOk(res)) return err(res.error);
    return ok(res.value);
  }
  if (/[0-9.]/.test(ch)) return handleNumber(s, i, tokens);
  if (/[A-Za-z_]/.test(ch)) return handleIdentifier(s, i, tokens);
  if (ch === ":" || ch === "=" || ch === ";") return handlePunct(s, i, tokens);
  return err("Invalid token");
}

function handleNumber(
  s: string,
  i: number,
  tokens: Token[]
): Result<number, string> {
  const nextIndex = parseAndPushNumber(s, i, tokens);
  if (!isOk(nextIndex)) return err(nextIndex.error);
  return ok(nextIndex.value);
}

function handleIdentifier(
  s: string,
  i: number,
  tokens: Token[]
): Result<number, string> {
  const nextIndex = parseAndPushIdentifier(s, i, tokens);
  if (!isOk(nextIndex)) return err(nextIndex.error);
  return ok(nextIndex.value);
}

function handlePunct(
  s: string,
  i: number,
  tokens: Token[]
): Result<number, string> {
  const ch = s[i];
  // handle arrow '=>'
  if (ch === "=" && s[i + 1] === ">") {
    tokens.push({ type: "punct", value: "=>" });
    return ok(i + 2);
  }
  tokens.push({ type: "punct", value: ch as ":" | "=" | ";" | "{" | "}" });
  return ok(i + 1);
}
export function tokenize(s: string): Result<Token[], string> {
  const tokens: Token[] = [];
  let i = 0;
  const len = s.length;

  while (i < len) {
    const res = handleChar(s, i, tokens);
    if (!isOk(res)) return err(res.error);
    i = res.value;
  }

  return ok(tokens);
}
