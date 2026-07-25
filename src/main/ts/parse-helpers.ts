import type { Token, Result, CompileError, Expression } from "./types";
import type { ParseContext } from "./parse-expressions";

export function expectToken(
  ctx: ParseContext,
  type: string,
  expected: string,
): Result<Token, CompileError> {
  const token = peekToken(ctx);
  if (!token)
    return {
      isOk: false,
      error: {
        message: "Expected '" + expected + "'",
        reason: "Missing " + expected + ".",
        suggestedFix: "Add '" + expected + "'.",
        line: 0,
        column: 0,
      },
    };
  if (token.type !== type)
    return {
      isOk: false,
      error: {
        message: "Expected '" + expected + "', got '" + token.value + "'",
        reason: "Unexpected token.",
        suggestedFix: "Use '" + expected + "'.",
        line: token.line,
        column: token.column,
      },
    };
  consumeToken(ctx);
  return { isOk: true, value: token };
}

export function peekToken(ctx: ParseContext): Token | undefined {
  return ctx.tokens[ctx.pos];
}

export function consumeToken(ctx: ParseContext): Token {
  return ctx.tokens[ctx.pos++]!;
}

export function unexpectedTokenError(
  token: Token,
  expected: string,
): Result<never, CompileError> {
  return {
    isOk: false,
    error: {
      message: "Unexpected token: '" + token.value + "'",
      reason: "Expected " + expected + ".",
      suggestedFix: "Use a supported expression.",
      line: token.line,
      column: token.column,
    },
  };
}

export function unexpectedEofError(
  expected: string,
): Result<never, CompileError> {
  return {
    isOk: false,
    error: {
      message: "Unexpected end of input",
      reason: "Expected " + expected + ".",
      suggestedFix: "Add a valid expression.",
      line: 0,
      column: 0,
    },
  };
}
export function expectRParen(ctx: ParseContext): Result<void, CompileError> {
  const rparen = peekToken(ctx);
  if (!rparen || rparen.type !== "RPAREN")
    return unexpectedTokenError(
      rparen || { type: "EOF", value: "", line: 0, column: 0 },
      "')' or ','",
    );
  consumeToken(ctx);
  return { isOk: true, value: undefined };
}

export function parseModuleAccess(
  ctx: ParseContext,
  firstPart: string,
  line: number,
  column: number,
): Result<Expression, CompileError> {
  const modulePath: string[] = [firstPart];
  parseModulePathSegments(ctx, modulePath);
  const dot = peekToken(ctx);
  if (dot && dot.value === ".") {
    return parseModuleField(ctx, modulePath, line, column);
  }
  return {
    isOk: true,
    value: { type: "Identifier", name: modulePath.join("::") },
  };
}

function parseModulePathSegments(
  ctx: ParseContext,
  modulePath: string[],
): void {
  while (true) {
    const next = peekToken(ctx);
    if (next && next.type === "DOUBLE_COLON") {
      consumeToken(ctx);
      const partToken = peekToken(ctx);
      if (!partToken || partToken.type !== "IDENTIFIER") break;
      consumeToken(ctx);
      modulePath.push(partToken.value);
    } else break;
  }
}

function parseModuleField(
  ctx: ParseContext,
  modulePath: string[],
  line: number,
  column: number,
): Result<Expression, CompileError> {
  consumeToken(ctx);
  const fieldToken = peekToken(ctx);
  if (!fieldToken || fieldToken.type !== "IDENTIFIER")
    return unexpectedTokenError(
      fieldToken || { type: "EOF", value: "", line: 0, column: 0 },
      "field name",
    );
  consumeToken(ctx);
  return {
    isOk: true,
    value: {
      type: "ModuleAccess",
      modulePath,
      field: fieldToken.value,
      line,
      column,
    },
  };
}
