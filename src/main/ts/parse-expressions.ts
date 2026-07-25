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
  return parseOrExpression(ctx);
}

function parseOrExpression(
  ctx: ParseContext,
): Result<Expression, CompileError> {
  let left = parseAndExpression(ctx);
  if (!left.isOk) return left;
  while (true) {
    const tok = peek(ctx);
    if (tok && tok.type === "OR") {
      consume(ctx);
      const rightResult = parseAndExpression(ctx);
      if (!rightResult.isOk) return rightResult;
      left = {
        isOk: true,
        value: {
          type: "LogicalExpression",
          operator: "OR" as const,
          left: left.value,
          right: rightResult.value,
          line: tok.line,
          column: tok.column,
        },
      };
    } else break;
  }
  return left;
}

function parseAndExpression(
  ctx: ParseContext,
): Result<Expression, CompileError> {
  let left = parseUnaryExpression(ctx);
  if (!left.isOk) return left;
  while (true) {
    const tok = peek(ctx);
    if (tok && tok.type === "AND") {
      consume(ctx);
      const rightResult = parseUnaryExpression(ctx);
      if (!rightResult.isOk) return rightResult;
      left = {
        isOk: true,
        value: {
          type: "LogicalExpression",
          operator: "AND" as const,
          left: left.value,
          right: rightResult.value,
          line: tok.line,
          column: tok.column,
        },
      };
    } else break;
  }
  return left;
}

function parseUnaryExpression(
  ctx: ParseContext,
): Result<Expression, CompileError> {
  const token = peek(ctx);
  if (!token) return unexpectedEofError("an expression");
  if (token.type === "NOT") {
    consume(ctx);
    const operandResult = parseUnaryExpression(ctx);
    if (!operandResult.isOk) return operandResult;
    return {
      isOk: true,
      value: {
        type: "NotExpression",
        operand: operandResult.value,
        line: token.line,
        column: token.column,
      },
    };
  }
  return parsePostfixExpression(ctx);
}

function parsePrimaryWithChain(
  ctx: ParseContext,
  parser: (ctx: ParseContext) => Result<Expression, CompileError>,
): Result<Expression, CompileError> {
  const r = parser(ctx);
  if (!r.isOk) return r;
  const memberResult = parseMemberChain(ctx, r.value);
  if (!memberResult.isOk) return memberResult;
  return parseIsExpression(ctx, memberResult.value);
}

function parsePostfixExpression(
  ctx: ParseContext,
): Result<Expression, CompileError> {
  const token = peek(ctx);
  if (!token) return unexpectedEofError("an expression");
  if (token.type === "NUMBER")
    return parsePrimaryWithChain(ctx, parseNumberLiteral);
  if (token.type === "BOOLEAN")
    return parsePrimaryWithChain(ctx, parseBooleanLiteral);
  if (token.type === "STRING_LITERAL")
    return parsePrimaryWithChain(ctx, parseStringLiteral);
  if (token.type === "IDENTIFIER") return parseIdentifierExpression(ctx);
  return unexpectedTokenError(
    token,
    "a number, string, identifier, or boolean",
  );
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

function parseStringLiteral(
  ctx: ParseContext,
): Result<Expression, CompileError> {
  const token = consume(ctx);
  return {
    isOk: true,
    value: {
      type: "StringLiteral",
      value: token.value,
      line: token.line,
      column: token.column,
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
  if (itemToken.type !== "IDENTIFIER")
    return unexpectedTokenError(itemToken, label);
  consume(ctx);
  return { isOk: true, value: itemToken.value };
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

  const baseResult = parseBaseTypeWithGenerics(ctx);
  let typeName: string = baseResult.isOk ? baseResult.value : "";
  if (!baseResult.isOk) return baseResult;
  // Parse disjunction arms separated by PIPE tokens (|)
  while (peek(ctx)?.type === "PIPE") {
    consume(ctx);
    const nextResult = parseTypeNameWithGenerics(ctx);
    if (!nextResult.isOk) return nextResult;
    typeName += " | " + nextResult.value;
  }

  return { isOk: true, value: typeName };
}

function parseBaseTypeWithGenerics(
  ctx: ParseContext,
): Result<string, CompileError> {
  const typeToken = peek(ctx);
  let typeName = typeToken!.value;
  consume(ctx);

  if (peek(ctx)?.type === "LBRACKET") {
    consume(ctx);
    const argsResult = parseBracketedList(ctx, "type argument");
    if (!argsResult.isOk) return argsResult;
    typeName += "<" + argsResult.value.join(", ") + ">";
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
