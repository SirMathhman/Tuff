/**
 * Recursive-descent parser and evaluator for Tuff expressions.
 *
 * Parses a token stream into a value, honoring standard operator
 * precedence, parentheses/braces as grouping, and `let` bindings
 * inside brace blocks. All failures are reported as structured
 * `TuffError` values carrying the offending source position.
 */
import type { Result, TuffError } from "./errors.js";
import type { Token } from "./lexer.js";

interface Parser {
  tokens: Token[];
  pos: number;
  env: Map<string, number>;
}

export function parseExpression(tokens: Token[]): Result<number, TuffError> {
  const parser: Parser = { tokens, pos: 0, env: new Map() };
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
  if (token.type === "ident") {
    return parseIdentifier(parser, token);
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
  if (open.type === "lbrace") {
    const statements = parseBlockStatements(parser);
    if (!statements.ok) {
      return statements;
    }
  }
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

function parseIdentifier(
  parser: Parser,
  token: Extract<Token, { type: "ident" }>,
): Result<number, TuffError> {
  const value = parser.env.get(token.name);
  if (value === undefined) {
    return {
      ok: false,
      error: {
        kind: "parse",
        message: `Undeclared variable "${token.name}"`,
        position: token.position,
        hint: `Declare it with "let ${token.name} = <expression>;" before using it.`,
      },
    };
  }
  parser.pos += 1;
  return { ok: true, value };
}

function parseBlockStatements(parser: Parser): Result<void, TuffError> {
  for (;;) {
    const token = peek(parser);
    if (!token || token.type !== "let") {
      return { ok: true, value: undefined };
    }
    const statement = parseLetStatement(parser);
    if (!statement.ok) {
      return statement;
    }
  }
}

function parseLetStatement(parser: Parser): Result<void, TuffError> {
  const letToken = peek(parser);
  parser.pos += 1;
  const name = peek(parser);
  if (!name || name.type !== "ident") {
    return expectedNameError(name, letToken);
  }
  parser.pos += 1;
  const eq = peek(parser);
  if (!eq || eq.type !== "assign") {
    return expectedAssignError(eq, name);
  }
  parser.pos += 1;
  const value = parseAdditive(parser);
  if (!value.ok) {
    return value;
  }
  const semi = peek(parser);
  if (!semi || semi.type !== "semicolon") {
    return expectedSemicolonError(semi, name);
  }
  parser.pos += 1;
  if (parser.env.has(name.name)) {
    return duplicateDeclarationError(name);
  }
  parser.env.set(name.name, value.value);
  return { ok: true, value: undefined };
}

function expectedNameError(name: Token | undefined, letToken: Token | undefined) {
  return {
    ok: false as const,
    error: {
      kind: "parse" as const,
      message: 'Expected a variable name after "let"',
      position: name?.position ?? letToken?.position ?? { offset: 0, line: 1, column: 1 },
      hint: 'Use a name made of letters, digits, and underscores, e.g. "let x = 1;".',
    },
  };
}

function expectedAssignError(eq: Token | undefined, name: Extract<Token, { type: "ident" }>) {
  return {
    ok: false as const,
    error: {
      kind: "parse" as const,
      message: 'Expected "=" after the variable name',
      position: eq ? eq.position : name.position,
      hint: 'A let binding needs an initializer: "let x = <expression>;".',
    },
  };
}

function expectedSemicolonError(semi: Token | undefined, name: Extract<Token, { type: "ident" }>) {
  return {
    ok: false as const,
    error: {
      kind: "parse" as const,
      message: 'Expected ";" at the end of the let statement',
      position: semi ? semi.position : name.position,
      hint: "End the let statement with a semicolon before the next expression.",
    },
  };
}

function duplicateDeclarationError(name: Extract<Token, { type: "ident" }>) {
  return {
    ok: false as const,
    error: {
      kind: "parse" as const,
      message: `Duplicate declaration of "${name.name}"`,
      position: name.position,
      hint: "Each variable may only be declared once with let.",
    },
  };
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
    case "let":
      return "let";
    case "ident":
      return token.name;
    case "assign":
      return "=";
    case "semicolon":
      return ";";
  }
}
