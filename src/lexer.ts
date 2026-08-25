import type { Result } from "./errors.ts";
import { fail } from "./errors.ts";

export type TokenKind = "number" | "identifier" | "keyword" | "punctuation";

export type Token = { value: string; kind: TokenKind; position: number };

const KEYWORDS = new Set([
  "let",
  "mut",
  "return",
  "true",
  "false",
  "if",
  "else",
]);

export function tokenize(input: string): Result<Token[]> {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (/\s/.test(ch)) {
      i++;
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /\w/.test(input.charAt(j))) j++;
      const value = input.slice(i, j);
      const kind: TokenKind = KEYWORDS.has(value) ? "keyword" : "identifier";
      tokens.push({ value, kind, position: i });
      i = j;
    } else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < input.length && /[\d.]/.test(input.charAt(j))) j++;
      const value = input.slice(i, j);
      if (!/^\d+(\.\d+)?$/.test(value))
        return fail({
          kind: "InvalidNumberLiteral",
          literal: value,
          position: i,
        });
      tokens.push({ value, kind: "number", position: i });
      i = j;
    } else if (
      ch === "=" ||
      ch === ";" ||
      ch === "{" ||
      ch === "}" ||
      ch === "(" ||
      ch === ")" ||
      ch === "<"
    ) {
      tokens.push({ value: ch, kind: "punctuation", position: i });
      i++;
    } else if (ch === "+" && input.charAt(i + 1) === "=") {
      tokens.push({ value: "+=", kind: "punctuation", position: i });
      i += 2;
    } else if (ch === "|" && input.charAt(i + 1) === "|") {
      tokens.push({ value: "||", kind: "punctuation", position: i });
      i += 2;
    } else if (ch === "&" && input.charAt(i + 1) === "&") {
      tokens.push({ value: "&&", kind: "punctuation", position: i });
      i += 2;
    } else {
      return fail({ kind: "UnexpectedCharacter", ch, position: i });
    }
  }
  return { ok: true, value: tokens };
}
