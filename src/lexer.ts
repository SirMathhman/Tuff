/**
 * Tokenizer for Tuff expressions.
 *
 * Converts source text into a flat token stream, tracking the source
 * position (offset, line, column) of every token so that downstream
 * parse errors can point at exactly where the problem is.
 */
import type { Result, SourcePosition, TuffError } from "./errors.js";

export type Token =
  | { type: "number"; value: number; position: SourcePosition }
  | { type: "op"; value: "+" | "-" | "*" | "/"; position: SourcePosition }
  | { type: "lparen"; position: SourcePosition }
  | { type: "rparen"; position: SourcePosition }
  | { type: "lbrace"; position: SourcePosition }
  | { type: "rbrace"; position: SourcePosition }
  | { type: "let"; position: SourcePosition }
  | { type: "ident"; name: string; position: SourcePosition }
  | { type: "assign"; position: SourcePosition }
  | { type: "semicolon"; position: SourcePosition };

export function tokenize(input: string): Result<Token[], TuffError> {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let column = 1;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t") {
      i += 1;
      column += 1;
      continue;
    }
    if (ch === "\n") {
      i += 1;
      line += 1;
      column = 1;
      continue;
    }
    const position: SourcePosition = { offset: i, line, column };
    const token = lexToken(input, i, position);
    if (!token.ok) {
      return token;
    }
    tokens.push(token.value.token);
    i += token.value.length;
    column += token.value.length;
  }
  return { ok: true, value: tokens };
}

function lexToken(
  input: string,
  i: number,
  position: SourcePosition,
): Result<{ token: Token; length: number }, TuffError> {
  const symbol = lexSymbol(input[i], position);
  if (symbol) {
    return { ok: true, value: { token: symbol, length: 1 } };
  }
  return lexWord(input, i, position);
}

function lexSymbol(ch: string, position: SourcePosition): Token | undefined {
  switch (ch) {
    case "(":
      return { type: "lparen", position };
    case ")":
      return { type: "rparen", position };
    case "{":
      return { type: "lbrace", position };
    case "}":
      return { type: "rbrace", position };
    case "+":
    case "-":
    case "*":
    case "/":
      return { type: "op", value: ch, position };
    case "=":
      return { type: "assign", position };
    case ";":
      return { type: "semicolon", position };
    default:
      return undefined;
  }
}

function lexWord(
  input: string,
  i: number,
  position: SourcePosition,
): Result<{ token: Token; length: number }, TuffError> {
  const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i));
  if (ident) {
    const name = ident[0];
    const token: Token =
      name === "let" ? { type: "let", position } : { type: "ident", name, position };
    return { ok: true, value: { token, length: name.length } };
  }
  const number = /^\d+(\.\d+)?/.exec(input.slice(i));
  if (number) {
    return {
      ok: true,
      value: {
        token: { type: "number", value: Number(number[0]), position },
        length: number[0].length,
      },
    };
  }
  return {
    ok: false,
    error: {
      kind: "lex",
      message: `Unexpected character "${input[i]}"`,
      position,
      hint: `Only digits, ".", letters, "+", "-", "*", "/", "(", ")", "{", "}", "=", and ";" are allowed at this position.`,
    },
  };
}
