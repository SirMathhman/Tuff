import type { Token, Result, CompileError, Expression } from "./types";
import {
  expectToken as expectTokenHelper,
  peekToken as peek,
  consumeToken as consume,
  unexpectedTokenError,
  unexpectedEofError,
} from "./parse-helpers";

export interface ParseContext {
  tokens: Token[];
  pos: number;
}

export { peekToken as peek, consumeToken as consume } from "./parse-helpers";

export function parseExpression(
  ctx: ParseContext,
): Result<Expression, CompileError> {
  const token = peek(ctx);
  if (!token) return unexpectedEofError("an expression");
  if (token.type === "NUMBER") {
    const r = parseNumberLiteral(ctx);
    if (!r.isOk) return r;
    return parseIsExpression(ctx, r.value);
  }
  if (token.type === "BOOLEAN") {
    const r = parseBooleanLiteral(ctx);
    if (!r.isOk) return r;
    return parseIsExpression(ctx, r.value);
  }
  if (token.type === "IDENTIFIER") return parseIdentifierExpression(ctx);
  return unexpectedTokenError(token, "a number, identifier, or boolean");
}

function parseBooleanLiteral(
  ctx: ParseContext,
): Result<Expression, CompileError> {
  const token = consume(ctx);
  return {
    isOk: true,
    value: { type: "BooleanLiteral", value: token.value === "true" },
  };
}

function parseIsExpression(
  ctx: ParseContext,
  expr: Expression,
): Result<Expression, CompileError> {
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

function parseNumberLiteral(
  ctx: ParseContext,
): Result<Expression, CompileError> {
  const token = consume(ctx);
  return {
    isOk: true,
    value: {
      type: "NumberLiteral",
      value: parseInt(token.value, 10),
      typeName: token.typeSuffix || undefined,
    },
  };
}

function parseIdentifierExpression(
  ctx: ParseContext,
): Result<Expression, CompileError> {
  const token = consume(ctx);
  const name = token.value;

  const next = peek(ctx);
  let typeArgs: string[] = [];
  if (next && next.type === "LBRACKET") {
    consume(ctx);
    const typeArgsResult = parseBracketedList(ctx, "type argument");
    if (!typeArgsResult.isOk) return typeArgsResult;
    typeArgs = typeArgsResult.value;
  }

  const after = peek(ctx);
  if (after && after.type === "LBRACE") {
    const structResult = parseStructInstance(ctx, name, typeArgs);
    if (!structResult.isOk) return structResult;
    const isResult = parseIsExpression(ctx, structResult.value);
    if (!isResult.isOk) return isResult;
    return { isOk: true, value: isResult.value };
  }

  const expr: Expression = { type: "Identifier", name };
  const memberResult = parseMemberChain(ctx, expr);
  if (!memberResult.isOk) return memberResult;
  const isResult = parseIsExpression(ctx, memberResult.value);
  if (!isResult.isOk) return isResult;
  return { isOk: true, value: isResult.value };
}

function parseMemberChain(
  ctx: ParseContext,
  expr: Expression,
): Result<Expression, CompileError> {
  let current: Expression = expr;
  while (true) {
    const dot = peek(ctx);
    if (dot && dot.value === ".") {
      consume(ctx);
      const fieldToken = peek(ctx);
      if (!fieldToken || fieldToken.type !== "IDENTIFIER")
        return unexpectedTokenError(
          fieldToken || { type: "EOF", value: "", line: 0, column: 0 },
          "field name",
        );
      consume(ctx);
      current = {
        type: "MemberExpression",
        object: current,
        field: fieldToken.value,
      };
    } else break;
  }
  return { isOk: true, value: current };
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
    const itemToken = peek(ctx);
    if (!itemToken || itemToken.type !== "IDENTIFIER")
      return unexpectedTokenError(
        itemToken || { type: "EOF", value: "", line: 0, column: 0 },
        label,
      );
    items.push(itemToken.value);
    consume(ctx);
  }
  return { isOk: true, value: items };
}

function parseStructInstance(
  ctx: ParseContext,
  structName: string,
  typeArgs: string[],
): Result<Expression, CompileError> {
  consume(ctx);
  const fields: { name: string; value: Expression }[] = [];
  while (true) {
    const next = peek(ctx);
    if (!next) return unexpectedEofError("'}'");
    if (next.type === "RBRACE") {
      consume(ctx);
      break;
    }
    if (next.type === "IDENTIFIER") {
      const fieldName = next.value;
      consume(ctx);
      const colonResult = expectToken(ctx, "COLON", ":");
      if (!colonResult.isOk) return colonResult;
      const valueResult = parseExpression(ctx);
      if (!valueResult.isOk) return valueResult;
      fields.push({ name: fieldName, value: valueResult.value });
      const after = peek(ctx);
      if (after && after.type === "COMMA") consume(ctx);
    } else {
      return unexpectedTokenError(next, "field name or '}'");
    }
  }
  return {
    isOk: true,
    value: { type: "StructInstance", structName, typeArgs, fields },
  };
}

export function parseTypeNameWithGenerics(
  ctx: ParseContext,
): Result<string, CompileError> {
  const typeToken = peek(ctx);
  if (!typeToken || typeToken.type !== "IDENTIFIER")
    return unexpectedTokenError(
      typeToken || { type: "EOF", value: "", line: 0, column: 0 },
      "type name",
    );
  let typeName = typeToken.value;
  consume(ctx);
  const ltToken = peek(ctx);
  if (ltToken && ltToken.type === "LBRACKET") {
    consume(ctx);
    const typeArgsResult = parseBracketedList(ctx, "type argument");
    if (!typeArgsResult.isOk) return typeArgsResult;
    typeName = typeName + "<" + typeArgsResult.value.join(", ") + ">";
  }
  return { isOk: true, value: typeName };
}

function expectToken(
  ctx: ParseContext,
  type: string,
  expected: string,
): Result<Token, CompileError> {
  return expectTokenHelper(ctx, type, expected);
}
