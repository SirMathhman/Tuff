/**
 * Evaluates an arithmetic expression string and returns its numeric value.
 *
 * An empty (or whitespace-only) input evaluates to 0.
 *
 * Supports integers and decimals, the operators `+`, `-`, `*`, `/`,
 * unary `+`/`-`, and parentheses, honoring standard operator precedence.
 */
export function evaluate(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") {
    return 0;
  }
  return parseExpression(tokenize(trimmed));
}

type Token =
  | { type: "number"; value: number }
  | { type: "op"; value: "+" | "-" | "*" | "/" }
  | { type: "lparen" }
  | { type: "rparen" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t") {
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i += 1;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }
    const number = /^\d+(\.\d+)?/.exec(input.slice(i));
    if (!number) {
      throw new Error(`Unexpected character "${ch}" in: "${input}"`);
    }
    tokens.push({ type: "number", value: Number(number[0]) });
    i += number[0].length;
  }
  return tokens;
}

interface Parser {
  tokens: Token[];
  pos: number;
}

function parseExpression(tokens: Token[]): number {
  const parser: Parser = { tokens, pos: 0 };
  const result = parseAdditive(parser);
  if (parser.pos < tokens.length) {
    throw new Error(`Unexpected trailing token "${describeToken(tokens[parser.pos])}"`);
  }
  return result;
}

function peek(parser: Parser): Token | undefined {
  return parser.tokens[parser.pos];
}

function parsePrimary(parser: Parser): number {
  const token = peek(parser);
  if (!token) {
    throw new Error("Unexpected end of expression");
  }
  if (token.type === "number") {
    parser.pos += 1;
    return token.value;
  }
  if (token.type === "lparen") {
    parser.pos += 1;
    const value = parseAdditive(parser);
    const closing = peek(parser);
    if (!closing || closing.type !== "rparen") {
      throw new Error("Expected a closing parenthesis");
    }
    parser.pos += 1;
    return value;
  }
  if (token.type === "op" && (token.value === "+" || token.value === "-")) {
    parser.pos += 1;
    const value = parsePrimary(parser);
    return token.value === "-" ? -value : value;
  }
  throw new Error(`Unexpected token "${describeToken(token)}"`);
}

function parseMultiplicative(parser: Parser): number {
  let value = parsePrimary(parser);
  for (;;) {
    const token = peek(parser);
    if (token && token.type === "op" && (token.value === "*" || token.value === "/")) {
      parser.pos += 1;
      const rhs = parsePrimary(parser);
      value = token.value === "*" ? value * rhs : value / rhs;
    } else {
      return value;
    }
  }
}

function parseAdditive(parser: Parser): number {
  let value = parseMultiplicative(parser);
  for (;;) {
    const token = peek(parser);
    if (token && token.type === "op" && (token.value === "+" || token.value === "-")) {
      parser.pos += 1;
      const rhs = parseMultiplicative(parser);
      value = token.value === "+" ? value + rhs : value - rhs;
    } else {
      return value;
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
  }
}
