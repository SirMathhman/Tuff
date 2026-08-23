import { TuffError } from "./errors.ts";
import type { Position } from "./errors.ts";

export type TokenKind =
  "number" | "identifier" | "keyword" | "operator" | "lparen" | "rparen" | "semicolon" | "eof";

export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly position: Position;
}

const KEYWORDS = new Set(["let", "mut", "return"]);
const OPERATORS = new Set(["=", "+", "-", "*", "/", "%", "&"]);

export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let column = 1;

  while (i < source.length) {
    const ch = source.charAt(i);
    if (ch === "\n") {
      line++;
      column = 1;
      i++;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r") {
      column++;
      i++;
      continue;
    }

    const start: Position = { line, column };

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source.charAt(i + 1)))) {
      let num = "";
      while (i < source.length && /[0-9.]/.test(source.charAt(i))) {
        num += source.charAt(i);
        i++;
        column++;
      }
      if ((num.match(/\./g) ?? []).length > 1) {
        throw new TuffError("syntax", `Invalid number literal "${num}"`, start);
      }
      tokens.push({ kind: "number", value: num, position: start });
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let ident = "";
      while (i < source.length && /[A-Za-z0-9_]/.test(source.charAt(i))) {
        ident += source.charAt(i);
        i++;
        column++;
      }
      tokens.push({
        kind: KEYWORDS.has(ident) ? "keyword" : "identifier",
        value: ident,
        position: start,
      });
      continue;
    }

    if (OPERATORS.has(ch)) {
      tokens.push({ kind: "operator", value: ch, position: start });
      i++;
      column++;
      continue;
    }

    if (ch === "(") {
      tokens.push({ kind: "lparen", value: ch, position: start });
      i++;
      column++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen", value: ch, position: start });
      i++;
      column++;
      continue;
    }
    if (ch === ";") {
      tokens.push({ kind: "semicolon", value: ch, position: start });
      i++;
      column++;
      continue;
    }

    throw new TuffError("syntax", `Unexpected character "${ch}"`, start);
  }

  tokens.push({ kind: "eof", value: "", position: { line, column } });
  return tokens;
}
