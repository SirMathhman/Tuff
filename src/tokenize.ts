import { parseNumber } from "./utils/parseNumber";
import { Result, ok, err, isOk } from "./result";
import { StructInstance } from "./matchEval";

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
  value:
    | ":"
    | "="
    | ";"
    | "{"
    | "}"
    | "=>"
    | "+="
    | "-="
    | "*="
    | "/="
    | "%="
    | ",";
}
export interface CompOpToken {
  type: "comp";
  value: "<" | ">" | "<=" | ">=" | "==" | "!=";
}
export interface LogOpToken {
  type: "logop";
  value: "&&" | "||";
}
export interface NotToken {
  type: "not";
  value: "!";
}
export interface AmpToken {
  type: "amp";
  value: "&";
}
export interface DotToken {
  type: "dot";
  value: ".";
}
export interface StructToken {
  type: "struct";
  value: StructInstance;
}
export type Token =
  | NumToken
  | OpToken
  | ParenToken
  | IdentToken
  | PunctToken
  | CompOpToken
  | LogOpToken
  | NotToken
  | AmpToken
  | DotToken
  | StructToken;

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

function handleNumOrIdent(
  s: string,
  i: number,
  ch: string,
  tokens: Token[]
): Result<number, string> | -1 {
  if (/[0-9.]/.test(ch)) return handleNumber(s, i, tokens);
  if (/[A-Za-z_]/.test(ch)) return handleIdentifier(s, i, tokens);
  return -1;
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function handlePunctuationOrOperator(
  s: string,
  i: number,
  ch: string,
  tokens: Token[]
): Result<number, string> | undefined {
  if ("+-*/%".includes(ch)) {
    const res = handleOperator(s, i, ch, tokens);
    if (!isOk(res)) return err(res.error);
    return ok(res.value);
  }

  if (ch === ":" || ch === ";" || ch === "=" || ch === ",") {
    return handlePunct(s, i, tokens);
  }

  return undefined;
}

function handleChar(
  s: string,
  i: number,
  tokens: Token[]
): Result<number, string> {
  const ch = s[i];
  if (isWhitespace(ch)) return ok(i + 1);

  // Try single-token handlers that return position or -1
  let handled = tryHandleParenOrBrace(ch, i, tokens);
  if (handled !== -1) return ok(handled);

  handled = tryHandleLogicalOp(s, i, tokens);
  if (handled !== -1) return ok(handled);

  handled = tryHandleAmp(s, i, tokens);
  if (handled !== -1) return ok(handled);

  handled = tryHandleNot(s, i, tokens);
  if (handled !== -1) return ok(handled);

  handled = tryHandleCompoundAssign(s, i, tokens);
  if (handled !== -1) return ok(handled);

  handled = tryHandleComparison(s, i, tokens);
  if (handled !== -1) return ok(handled);

  // Try number or identifier
  const numOrIdentRes = handleNumOrIdent(s, i, ch, tokens);
  if (numOrIdentRes !== -1) return numOrIdentRes;

  const punctOrOpRes = handlePunctuationOrOperator(s, i, ch, tokens);
  if (punctOrOpRes !== undefined) return punctOrOpRes;

  return err("Invalid token");
}

function tryHandleParenOrBrace(ch: string, i: number, tokens: Token[]): number {
  if ("(){}".includes(ch)) {
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
    } else {
      tokens.push({ type: "punct", value: ch as "{" | "}" });
    }
    return i + 1;
  }
  if (ch === ".") {
    tokens.push({ type: "dot", value: "." });
    return i + 1;
  }
  return -1;
}

function tryHandleCompoundAssign(
  s: string,
  i: number,
  tokens: Token[]
): number {
  const ch = s[i];
  if ("+-*/%".includes(ch) && s[i + 1] === "=") {
    tokens.push({
      type: "punct",
      value: (ch + "=") as "+=" | "-=" | "*=" | "/=" | "%=",
    });
    return i + 2;
  }
  return -1;
}

function tryHandleLogicalOp(s: string, i: number, tokens: Token[]): number {
  const op = s.slice(i, i + 2);
  if (op === "&&" || op === "||") {
    tokens.push({ type: "logop", value: op as "&&" | "||" });
    return i + 2;
  }
  return -1;
}

function tryHandleComparison(s: string, i: number, tokens: Token[]): number {
  const op2 = s.slice(i, i + 2);
  if (["<=", ">=", "==", "!="].includes(op2)) {
    tokens.push({ type: "comp", value: op2 as "<=" | ">=" | "==" | "!=" });
    return i + 2;
  }

  const ch = s[i];
  if (ch === "<" || ch === ">") {
    tokens.push({ type: "comp", value: ch });
    return i + 1;
  }

  return -1;
}

function tryHandleNot(s: string, i: number, tokens: Token[]): number {
  // Standalone '!' is unary logical NOT; '!=' is handled by tryHandleComparison
  if (s[i] === "!") {
    if (s[i + 1] === "=") return -1; // let comparison handler process '!='
    tokens.push({ type: "not", value: "!" });
    return i + 1;
  }
  return -1;
}

function tryHandleAmp(s: string, i: number, tokens: Token[]): number {
  // Single '&' for address-of; '&&' handled by tryHandleLogicalOp
  if (s[i] === "&") {
    if (s[i + 1] === "&") return -1;
    tokens.push({ type: "amp", value: "&" });
    return i + 1;
  }
  return -1;
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
  tokens.push({ type: "punct", value: ch as ":" | ";" | "=" | "," });
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
