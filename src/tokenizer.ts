import type { TuffError } from "./errors.ts";
import { parseError } from "./errors.ts";

/**
 * A lexical token with its source position.
 */
export interface Token {
  kind: "number" | "ident" | "keyword" | "boolean" | "punct";
  value: string;
  pos: number;
}

/**
 * A successful tokenize result.
 */
export interface TokenizeOk {
  ok: true;
  tokens: Token[];
}

/**
 * A failed tokenize result.
 */
export interface TokenizeErr {
  ok: false;
  error: TuffError;
}

const KEYWORDS = new Set(["let", "mut", "return", "if", "else"]);

/**
 * Single-character punctuation tokens.
 */
const SINGLE_CHAR_PUNCT = new Set([
  "=",
  ";",
  "{",
  "}",
  "(",
  ")",
  "+",
  "-",
  "*",
]);

/**
 * A successful scan result: the token and the index after it.
 */
interface ScanOk {
  token: Token;
  next: number;
}

/**
 * A failed scan result.
 */
interface ScanErr {
  error: TuffError;
}

/**
 * Scan a number literal starting at index i.
 *
 * @param input - The source text.
 * @param i - The start index.
 * @returns The token and the index after the literal, or a structured error.
 */
function scanNumber(input: string, i: number): ScanOk | ScanErr {
  let j = i;
  if (input[j] === "-") j++;
  while (j < input.length && /[0-9.]/.test(input[j] ?? "")) j++;
  const text = input.slice(i, j);
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return { error: parseError(`Invalid number: ${text}`, i) };
  }
  return { token: { kind: "number", value: text, pos: i }, next: j };
}

/**
 * Scan an identifier, keyword, or boolean literal starting at index i.
 *
 * @param input - The source text.
 * @param i - The start index.
 * @returns The token and the index after the literal.
 */
function scanIdent(input: string, i: number): ScanOk {
  let j = i;
  while (j < input.length && /[A-Za-z0-9_]/.test(input[j] ?? "")) j++;
  const text = input.slice(i, j);
  const kind = KEYWORDS.has(text)
    ? "keyword"
    : text === "true" || text === "false"
      ? "boolean"
      : "ident";
  return { token: { kind, value: text, pos: i }, next: j };
}

/**
 * Tokenize source text into a flat token list.
 *
 * @param input - The source text.
 * @returns The tokens, or a structured parse error.
 */
export function tokenize(input: string): TokenizeOk | TokenizeErr {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === undefined) break;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(input[i + 1] ?? ""))) {
      const r = scanNumber(input, i);
      if ("error" in r) return { ok: false, error: r.error };
      tokens.push(r.token);
      i = r.next;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const r = scanIdent(input, i);
      tokens.push(r.token);
      i = r.next;
      continue;
    }
    if (ch === "|" && input[i + 1] === "|") {
      tokens.push({ kind: "punct", value: "||", pos: i });
      i += 2;
      continue;
    }
    if (ch === "=" && input[i + 1] === "=") {
      tokens.push({ kind: "punct", value: "==", pos: i });
      i += 2;
      continue;
    }
    if (ch === "+" && input[i + 1] === "=") {
      tokens.push({ kind: "punct", value: "+=", pos: i });
      i += 2;
      continue;
    }
    if (SINGLE_CHAR_PUNCT.has(ch)) {
      tokens.push({ kind: "punct", value: ch, pos: i });
      i++;
      continue;
    }
    return { ok: false, error: parseError(`Unexpected character: ${ch}`, i) };
  }
  return { ok: true, tokens };
}
