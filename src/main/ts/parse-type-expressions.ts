import type { Token, Result, CompileError } from "./types";
import type { ParseContext } from "./parse-expressions";
import {
  peekToken as peek,
  consumeToken as consume,
  unexpectedTokenError,
  unexpectedEofError,
  expectRParen,
  expectToken as expectTokenHelper,
} from "./parse-helpers";

function expectToken(
  ctx: ParseContext,
  type: string,
  expected: string,
): Result<Token, CompileError> {
  return expectTokenHelper(ctx, type, expected);
}

export function parseOptionalTypeArgs(
  ctx: ParseContext,
): Result<string[], CompileError> {
  const next = peek(ctx);
  if (next && next.type === "LBRACKET") {
    consume(ctx);
    const typeArgsResult = parseBracketedList(ctx, "type argument");
    if (!typeArgsResult.isOk) return typeArgsResult;
    return { isOk: true, value: typeArgsResult.value };
  }
  return { isOk: true, value: [] };
}

function parseBracketedItem(
  ctx: ParseContext,
  label: string,
): Result<string, CompileError> {
  const itemToken = peek(ctx);
  if (!itemToken)
    return unexpectedTokenError(
      itemToken || { type: "EOF", value: "", line: 0, column: 0 },
      label,
    );
  if (itemToken.type === "AMPERSAND") {
    consume(ctx);
    const afterAmp = peek(ctx);
    if (!afterAmp || afterAmp.type !== "IDENTIFIER")
      return unexpectedTokenError(
        afterAmp || { type: "EOF", value: "", line: 0, column: 0 },
        label,
      );
    consume(ctx);
    return { isOk: true, value: "&" + afterAmp.value };
  }
  return parseBaseTypeWithGenerics(ctx);
}

export function parseBracketedList(
  ctx: ParseContext,
  label: string,
): Result<string[], CompileError> {
  const items: string[] = [];
  while (true) {
    const next = peek(ctx);
    if (!next) return unexpectedEofError("'>'");
    if (next.type === "RBRACKET") {
      consume(ctx);
      break;
    }
    if (items.length > 0) {
      const commaResult = expectToken(ctx, "COMMA", ",");
      if (!commaResult.isOk) return commaResult;
    }
    const itemResult = parseBracketedItem(ctx, label);
    if (!itemResult.isOk) return itemResult;
    items.push(itemResult.value);
  }
  return { isOk: true, value: items };
}

function parseRemainingTupleTypes(
  ctx: ParseContext,
  types: string[],
): Result<string[], CompileError> {
  while (true) {
    const next = peek(ctx);
    if (next && next.type === "RPAREN") {
      consume(ctx);
      break;
    }
    const typeResult = parseTypeNameWithGenerics(ctx);
    if (!typeResult.isOk) return typeResult;
    types.push(typeResult.value);
    const comma = peek(ctx);
    if (comma && comma.type === "COMMA") consume(ctx);
  }
  return { isOk: true, value: types };
}

function parseTupleType(ctx: ParseContext): Result<string, CompileError> {
  consume(ctx);
  const firstResult = parseTypeNameWithGenerics(ctx);
  if (!firstResult.isOk) return firstResult;
  const after = peek(ctx);
  if (after && after.type === "COMMA") {
    consume(ctx);
    const typesResult = parseRemainingTupleTypes(ctx, [firstResult.value]);
    if (!typesResult.isOk) return typesResult;
    return { isOk: true, value: "(" + typesResult.value.join(", ") + ")" };
  }
  const rpErr = expectRParen(ctx);
  if (!rpErr.isOk) return rpErr;
  return { isOk: true, value: firstResult.value };
}

export function parseBaseTypeWithGenerics(
  ctx: ParseContext,
): Result<string, CompileError> {
  const typeToken = peek(ctx);
  if (!typeToken) return unexpectedEofError("type name");
  if (typeToken.type === "LPAREN") return parseTupleType(ctx);
  let typeName = typeToken.value;
  consume(ctx);

  if (peek(ctx)?.type === "LBRACKET") {
    consume(ctx);
    const argsResult = parseBracketedList(ctx, "type argument");
    if (!argsResult.isOk) return argsResult;
    typeName += "<" + argsResult.value.join(", ") + ">";
  }

  return { isOk: true, value: typeName };
}

export function parseTypeNameWithGenerics(
  ctx: ParseContext,
): Result<string, CompileError> {
  const typeToken = peek(ctx);
  if (
    !typeToken ||
    (typeToken.type !== "IDENTIFIER" && typeToken.type !== "LPAREN")
  )
    return unexpectedTokenError(
      typeToken || { type: "EOF", value: "", line: 0, column: 0 },
      "type name",
    );

  const baseResult = parseBaseTypeWithGenerics(ctx);
  let typeName: string = baseResult.isOk ? baseResult.value : "";
  if (!baseResult.isOk) return baseResult;
  while (peek(ctx)?.type === "PIPE") {
    consume(ctx);
    const nextResult = parseTypeNameWithGenerics(ctx);
    if (!nextResult.isOk) return nextResult;
    typeName += " | " + nextResult.value;
  }

  return { isOk: true, value: typeName };
}

export function parseIsExpression(
  ctx: ParseContext,
  expr: import("./types").Expression,
): Result<import("./types").Expression, CompileError> {
  const isToken = peek(ctx);
  if (isToken && isToken.type === "IS") {
    consume(ctx);
    const typeNameResult = parseTypeNameWithGenerics(ctx);
    if (!typeNameResult.isOk) return typeNameResult;
    return {
      isOk: true,
      value: {
        type: "IsExpression",
        operand: expr,
        typeName: typeNameResult.value,
      },
    };
  }
  return { isOk: true, value: expr };
}
