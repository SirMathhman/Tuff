import type { Result, CompileError, Statement, StructField } from "./types";
import type { ParseContext } from "./parse-expressions";
import {
  peekToken as peek,
  consumeToken as consume,
  unexpectedEofError,
  unexpectedTokenError,
  expectToken as expectTokenHelper,
} from "./parse-helpers";
import { parseTypeNameWithGenerics } from "./parse-type-expressions";
import { parseBracketedList } from "./parse-type-expressions";

function expectToken(
  ctx: ParseContext,
  type: string,
  expected: string,
): Result<import("./types").Token, CompileError> {
  return expectTokenHelper(ctx, type, expected);
}

export function parseNameWithTypeParams(
  ctx: ParseContext,
  expectedName: string,
): Result<{ name: string; typeParams: string[] }, CompileError> {
  const nameToken = peek(ctx);
  if (!nameToken || nameToken.type !== "IDENTIFIER")
    return unexpectedTokenError(
      nameToken || { type: "EOF", value: "", line: 0, column: 0 },
      expectedName,
    );
  const name = nameToken.value;
  consume(ctx);
  let typeParams: string[] = [];
  const afterName = peek(ctx);
  if (afterName && afterName.type === "LBRACKET") {
    consume(ctx);
    const typeParamsResult = parseBracketedList(ctx, "type parameter");
    if (!typeParamsResult.isOk) return typeParamsResult;
    typeParams = typeParamsResult.value;
  }
  return { isOk: true, value: { name, typeParams } };
}

function parseStructFields(
  ctx: ParseContext,
): Result<StructField[], CompileError> {
  const fields: StructField[] = [];
  while (true) {
    const next = peek(ctx);
    if (!next) return unexpectedEofError("'}'");
    if (next.type === "RBRACE") {
      consume(ctx);
      break;
    }
    const fieldResult = parseSingleField(ctx);
    if (!fieldResult.isOk) return fieldResult;
    fields.push(fieldResult.value);
    const after = peek(ctx);
    if (after && after.type === "COMMA") consume(ctx);
  }
  return { isOk: true, value: fields };
}

function parseSingleField(
  ctx: ParseContext,
): Result<StructField, CompileError> {
  const nameToken = peek(ctx);
  if (!nameToken || nameToken.type !== "IDENTIFIER")
    return unexpectedTokenError(
      nameToken || { type: "EOF", value: "", line: 0, column: 0 },
      "field name or '}'",
    );
  const fieldName = nameToken.value;
  consume(ctx);
  const colonResult = expectToken(ctx, "COLON", ":");
  if (!colonResult.isOk) return colonResult;
  if (peek(ctx)?.type === "AMPERSAND") consume(ctx);
  const typeName = parseTypeNameWithGenerics(ctx);
  if (!typeName.isOk) return typeName;
  return { isOk: true, value: { name: fieldName, typeName: typeName.value } };
}

export function parseStructDefinition(
  ctx: ParseContext,
  exported: boolean,
): Result<Statement, CompileError> {
  const structToken = peek(ctx);
  if (!structToken) return unexpectedEofError("struct");
  consume(ctx);
  const nameResult = parseNameWithTypeParams(ctx, "struct name");
  if (!nameResult.isOk) return nameResult;
  const structName = nameResult.value.name;
  const typeParams = nameResult.value.typeParams;

  const lbraceResult = expectToken(ctx, "LBRACE", "{");
  if (!lbraceResult.isOk) return lbraceResult;
  const fieldsResult = parseStructFields(ctx);
  if (!fieldsResult.isOk) return fieldsResult;
  consumeOptionalSemicolon(ctx);

  return {
    isOk: true,
    value: {
      type: "StructDefinition",
      name: structName,
      typeParams,
      exported,
      fields: fieldsResult.value,
      line: structToken.line,
      column: structToken.column,
    },
  };
}

export function parseTypeAlias(
  ctx: ParseContext,
  exported: boolean,
): Result<Statement, CompileError> {
  const typeToken = peek(ctx);
  if (!typeToken) return unexpectedEofError("type");
  consume(ctx);
  const nameResult = parseNameWithTypeParams(ctx, "alias name");
  if (!nameResult.isOk) return nameResult;
  const aliasName = nameResult.value.name;
  const typeParams = nameResult.value.typeParams;

  const equalsResult = expectToken(ctx, "EQUALS", "=");
  if (!equalsResult.isOk) return equalsResult;
  const underlyingResult = parseTypeNameWithGenerics(ctx);
  if (!underlyingResult.isOk) return underlyingResult;
  const semiResult = expectToken(ctx, "SEMICOLON", ";");
  if (!semiResult.isOk) return semiResult;

  return {
    isOk: true,
    value: {
      type: "TypeAlias",
      name: aliasName,
      typeParams,
      underlyingType: underlyingResult.value,
      exported,
      line: typeToken.line,
      column: typeToken.column,
    },
  };
}

function consumeOptionalSemicolon(ctx: ParseContext) {
  const next = peek(ctx);
  if (next && next.type === "SEMICOLON") consume(ctx);
}
