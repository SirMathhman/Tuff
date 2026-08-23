import type { EvalError, Position } from "./errors.ts";
import { Err, Ok } from "./result.ts";
import type { Result } from "./result.ts";

export type TokenKind =
  | "number"
  | "identifier"
  | "keyword"
  | "operator"
  | "lparen"
  | "rparen"
  | "lbrace"
  | "rbrace"
  | "lbracket"
  | "rbracket"
  | "comma"
  | "semicolon"
  | "eof";

export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly position: Position;
}

const KEYWORDS = new Set(["let", "mut", "return", "true", "false", "if", "else", "while"]);
const SINGLE_CHAR_TOKENS: Record<string, TokenKind> = {
  "=": "operator",
  "+": "operator",
  "-": "operator",
  "*": "operator",
  "/": "operator",
  "%": "operator",
  "&": "operator",
  "<": "operator",
  "(": "lparen",
  ")": "rparen",
  "[": "lbracket",
  "]": "rbracket",
  ",": "comma",
  ";": "semicolon",
  "{": "lbrace",
  "}": "rbrace",
};

export function lex(source: string): Result<Token[], EvalError> {
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
        return Err({
          kind: "syntax",
          message: `Invalid number literal "${num}"`,
          position: start,
          snippet: "",
        });
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

    if (ch === "+" && source.charAt(i + 1) === "=") {
      tokens.push({ kind: "operator", value: "+=", position: start });
      i += 2;
      column += 2;
      continue;
    }

    const single = SINGLE_CHAR_TOKENS[ch];
    if (single !== undefined) {
      tokens.push({ kind: single, value: ch, position: start });
      i++;
      column++;
      continue;
    }

    return Err({
      kind: "syntax",
      message: `Unexpected character "${ch}"`,
      position: start,
      snippet: "",
    });
  }

  tokens.push({ kind: "eof", value: "", position: { line, column } });
  return Ok(tokens);
}
