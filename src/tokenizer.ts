import type { TuffError } from "./errors.ts";

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

const KEYWORDS = new Set(["let", "mut", "return"]);

/**
 * Build a structured parse error.
 *
 * @param message - Human-readable description of the failure.
 * @param position - Zero-based offset of the failure in the source.
 * @returns The structured error.
 */
function parseError(message: string, position: number): TuffError {
  return { type: "ParseError", message, position };
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
      let j = i;
      if (input[j] === "-") j++;
      while (j < input.length && /[0-9.]/.test(input[j] ?? "")) j++;
      const text = input.slice(i, j);
      if (!/^-?\d+(\.\d+)?$/.test(text)) {
        return { ok: false, error: parseError(`Invalid number: ${text}`, i) };
      }
      tokens.push({ kind: "number", value: text, pos: i });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j] ?? "")) j++;
      const text = input.slice(i, j);
      const kind = KEYWORDS.has(text)
        ? "keyword"
        : text === "true" || text === "false"
          ? "boolean"
          : "ident";
      tokens.push({ kind, value: text, pos: i });
      i = j;
      continue;
    }
    if (ch === "|" && input[i + 1] === "|") {
      tokens.push({ kind: "punct", value: "||", pos: i });
      i += 2;
      continue;
    }
    if (ch === "=" || ch === ";" || ch === "{" || ch === "}") {
      tokens.push({ kind: "punct", value: ch, pos: i });
      i++;
      continue;
    }
    return { ok: false, error: parseError(`Unexpected character: ${ch}`, i) };
  }
  return { ok: true, tokens };
}
