import type { Token, Result, CompileError } from "./types";
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
