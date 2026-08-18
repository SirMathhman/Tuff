/**
 * Evaluates an arithmetic expression string and returns its numeric value.
 *
 * An empty (or whitespace-only) input evaluates to 0.
 *
 * Supports integers and decimals, the operators `+`, `-`, `*`, `/`,
 * unary `+`/`-`, and parentheses or braces as grouping delimiters,
 * honoring standard operator precedence.
 *
 * Malformed input does not throw; it returns a structured error via
 * `Result<number, TuffError>`.
 */
import type { Result, SourcePosition, TuffError } from "./errors.js";

export type { Result, SourcePosition, TuffError } from "./errors.js";

export function evaluate(input: string): Result<number, TuffError> {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: true, value: 0 };
  }
  const tokens = tokenize(trimmed);
  if (!tokens.ok) {
    return tokens;
  }
  return parseExpression(tokens.value);
}

type Token =
  | { type: "number"; value: number; position: SourcePosition }
  | { type: "op"; value: "+" | "-" | "*" | "/"; position: SourcePosition }
  | { type: "lparen"; position: SourcePosition }
  | { type: "rparen"; position: SourcePosition }
  | { type: "lbrace"; position: SourcePosition }
  | { type: "rbrace"; position: SourcePosition };

function tokenize(input: string): Result<Token[], TuffError> {
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
  const ch = input[i];
  if (ch === "(") {
    return { ok: true, value: { token: { type: "lparen", position }, length: 1 } };
  }
  if (ch === ")") {
    return { ok: true, value: { token: { type: "rparen", position }, length: 1 } };
  }
  if (ch === "{") {
    return { ok: true, value: { token: { type: "lbrace", position }, length: 1 } };
  }
  if (ch === "}") {
    return { ok: true, value: { token: { type: "rbrace", position }, length: 1 } };
  }
  if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
    return { ok: true, value: { token: { type: "op", value: ch, position }, length: 1 } };
  }
  const number = /^\d+(\.\d+)?/.exec(input.slice(i));
  if (!number) {
    return {
      ok: false,
      error: {
        kind: "lex",
        message: `Unexpected character "${ch}"`,
        position,
        hint: `Only digits, ".", "+", "-", "*", "/", "(", ")", "{", and "}" are allowed at this position.`,
      },
    };
  }
  return {
    ok: true,
    value: {
      token: { type: "number", value: Number(number[0]), position },
      length: number[0].length,
    },
  };
}

interface Parser {
  tokens: Token[];
  pos: number;
}

function parseExpression(tokens: Token[]): Result<number, TuffError> {
  const parser: Parser = { tokens, pos: 0 };
  const result = parseAdditive(parser);
  if (!result.ok) {
    return result;
  }
  if (parser.pos < tokens.length) {
    const token = tokens[parser.pos];
    return {
      ok: false,
      error: {
        kind: "parse",
        message: `Unexpected trailing token "${describeToken(token)}"`,
        position: token.position,
        hint: "Remove the extra token or complete the expression.",
      },
    };
  }
  return result;
}

function peek(parser: Parser): Token | undefined {
  return parser.tokens[parser.pos];
}

function parsePrimary(parser: Parser): Result<number, TuffError> {
  const token = peek(parser);
  if (!token) {
    return unexpectedEnd(parser);
  }
  if (token.type === "number") {
    parser.pos += 1;
    return { ok: true, value: token.value };
  }
  if (token.type === "lparen" || token.type === "lbrace") {
    return parseGrouped(parser, token);
  }
  if (token.type === "op" && (token.value === "+" || token.value === "-")) {
    return parseUnary(parser, token);
  }
  return {
    ok: false,
    error: {
      kind: "parse",
      message: `Unexpected token "${describeToken(token)}"`,
      position: token.position,
      hint: "An operand (number or parenthesized expression) is expected here.",
    },
  };
}

function unexpectedEnd(parser: Parser): { ok: false; error: TuffError } {
  const last = parser.tokens[parser.tokens.length - 1];
  return {
    ok: false,
    error: {
      kind: "parse",
      message: "Unexpected end of expression",
      position: last ? last.position : { offset: 0, line: 1, column: 1 },
      hint: "The expression is incomplete; add the missing operand or closing parenthesis.",
    },
  };
}

function parseGrouped(parser: Parser, open: Token): Result<number, TuffError> {
  parser.pos += 1;
  const value = parseAdditive(parser);
  if (!value.ok) {
    return value;
  }
  const isParen = open.type === "lparen";
  const expectedClose = isParen ? "rparen" : "rbrace";
  const closing = peek(parser);
  if (!closing || closing.type !== expectedClose) {
    return {
      ok: false,
      error: {
        kind: "parse",
        message: `Expected a closing ${isParen ? "parenthesis" : "brace"}`,
        position: closing ? closing.position : open.position,
        hint: `Add a ${isParen ? '")"' : '"}"'} to close the ${isParen ? "parenthesis" : "brace"} opened at column ${open.position.column}.`,
      },
    };
  }
  parser.pos += 1;
  return { ok: true, value: value.value };
}

function parseUnary(parser: Parser, sign: Token): Result<number, TuffError> {
  parser.pos += 1;
  const value = parsePrimary(parser);
  if (!value.ok) {
    return value;
  }
  const negate = sign.type === "op" && sign.value === "-";
  return { ok: true, value: negate ? -value.value : value.value };
}

function parseMultiplicative(parser: Parser): Result<number, TuffError> {
  const first = parsePrimary(parser);
  if (!first.ok) {
    return first;
  }
  let value = first.value;
  for (;;) {
    const token = peek(parser);
    if (token && token.type === "op" && (token.value === "*" || token.value === "/")) {
      parser.pos += 1;
      const rhs = parsePrimary(parser);
      if (!rhs.ok) {
        return rhs;
      }
      value = token.value === "*" ? value * rhs.value : value / rhs.value;
    } else {
      return { ok: true, value };
    }
  }
}

function parseAdditive(parser: Parser): Result<number, TuffError> {
  const first = parseMultiplicative(parser);
  if (!first.ok) {
    return first;
  }
  let value = first.value;
  for (;;) {
    const token = peek(parser);
    if (token && token.type === "op" && (token.value === "+" || token.value === "-")) {
      parser.pos += 1;
      const rhs = parseMultiplicative(parser);
      if (!rhs.ok) {
        return rhs;
      }
      value = token.value === "+" ? value + rhs.value : value - rhs.value;
    } else {
      return { ok: true, value };
    }
  }
}

function describeToken(token: Token): string {
  switch (token.type) {
    case "number":
      return String(token.value);
    case "op":
      return token.value;
    case "lparen":
      return "(";
    case "rparen":
      return ")";
    case "lbrace":
      return "{";
    case "rbrace":
      return "}";
  }
}
