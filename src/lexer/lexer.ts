import { ErrorKind } from "../errors.ts";
import type { EvalError, Position } from "../errors.ts";
import { Err, Ok } from "../result.ts";
import type { Result } from "../result.ts";

export type TokenKind =
  | "number"
  | "string"
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
  | "colon"
  | "dot"
  | "eof";

export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly position: Position;
}

interface StringLexResult {
  readonly token: Token;
  readonly next: number;
}

interface NumberLexResult {
  readonly value: string;
  readonly next: number;
}

function lexNumber(source: string, start: number): NumberLexResult {
  let i = start;
  let num = "";
  while (i < source.length && /[0-9.]/.test(source.charAt(i))) {
    num += source.charAt(i);
    i++;
  }
  const next = source.charAt(i);
  if (next === "U" || next === "I") {
    let j = i;
    while (j < source.length && /[A-Za-z0-9]/.test(source.charAt(j))) {
      j++;
    }
    const suffix = source.slice(i, j);
    if (INT_SUFFIXES.has(suffix)) {
      num += suffix;
      i = j;
    }
  }
  return { value: num, next: i };
}

const KEYWORDS = new Set([
  "let",
  "mut",
  "return",
  "true",
  "false",
  "if",
  "else",
  "while",
  "fn",
  "struct",
]);
const INT_SUFFIXES = new Set([
  "U8",
  "U16",
  "U32",
  "U64",
  "I8",
  "I16",
  "I32",
  "I64",
  "USize",
  "ISize",
]);
const TWO_CHAR_OPERATORS: Record<string, string> = { "+=": "+=", "=>": "=>" };
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
  ":": "colon",
  ".": "dot",
  "{": "lbrace",
  "}": "rbrace",
};

function lexString(
  source: string,
  start: number,
  position: Position,
): Result<StringLexResult, EvalError> {
  let i = start + 1;
  let str = "";
  while (i < source.length && source.charAt(i) !== '"') {
    if (source.charAt(i) === "\n") {
      return Err({
        kind: ErrorKind.Syntax,
        message: "Unterminated string literal",
        position,
        snippet: "",
      });
    }
    str += source.charAt(i);
    i++;
  }
  if (i >= source.length) {
    return Err({
      kind: ErrorKind.Syntax,
      message: "Unterminated string literal",
      position,
      snippet: "",
    });
  }
  i++;
  return Ok({ token: { kind: "string", value: str, position }, next: i });
}

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
      const r = lexNumber(source, i);
      const num = r.value;
      if ((num.match(/\./g) ?? []).length > 1) {
        return Err({
          kind: ErrorKind.Syntax,
          message: `Invalid number literal "${num}"`,
          position: start,
          snippet: "",
        });
      }
      column += r.next - i;
      i = r.next;
      tokens.push({ kind: "number", value: num, position: start });
      continue;
    }

    if (ch === '"') {
      const r = lexString(source, i, start);
      if (!r.ok) return r;
      column += r.value.next - i;
      i = r.value.next;
      tokens.push(r.value.token);
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

    const twoChar = TWO_CHAR_OPERATORS[ch + source.charAt(i + 1)];
    if (twoChar !== undefined) {
      tokens.push({ kind: "operator", value: twoChar, position: start });
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
      kind: ErrorKind.Syntax,
      message: `Unexpected character "${ch}"`,
      position: start,
      snippet: "",
    });
  }

  tokens.push({ kind: "eof", value: "", position: { line, column } });
  return Ok(tokens);
}
