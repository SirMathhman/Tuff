import type { Token, Result, CompileError, Expression } from "./types";
import {
  expectToken as expectTokenHelper,
  peekToken as peek,
  consumeToken as consume,
  unexpectedTokenError,
  unexpectedEofError,
  expectRParen,
  parseModuleAccess as parseModuleAccessHelper,
} from "./parse-helpers";
import {
  parseOptionalTypeArgs,
  parseIsExpression,
} from "./parse-type-expressions";

export interface ParseContext {
  tokens: Token[];
  pos: number;
}

export {
  peekToken as peek,
  consumeToken as consume,
  expectRParen,
} from "./parse-helpers";

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
  return parseAdditiveExpression(ctx);
}

function parseAdditiveExpression(
  ctx: ParseContext,
): Result<Expression, CompileError> {
  let left = parseMultiplicativeExpression(ctx);
  if (!left.isOk) return left;
  while (true) {
    const tok = peek(ctx);
    if (tok && (tok.type === "PLUS" || tok.type === "MINUS")) {
      const op = tok.type === "PLUS" ? "+" : "-";
      consume(ctx);
      const rightResult = parseMultiplicativeExpression(ctx);
      if (!rightResult.isOk) return rightResult;
      left = {
        isOk: true,
        value: {
          type: "BinaryExpression",
          operator: op as "+" | "-",
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

function parseMultiplicativeExpression(
  ctx: ParseContext,
): Result<Expression, CompileError> {
  let left = parsePostfixExpression(ctx);
  if (!left.isOk) return left;
  while (true) {
    const tok = peek(ctx);
    if (
      tok &&
      (tok.type === "STAR" || tok.type === "SLASH" || tok.type === "PERCENT")
    ) {
      const op = tok.type === "STAR" ? "*" : tok.type === "SLASH" ? "/" : "%";
      consume(ctx);
      const rightResult = parsePostfixExpression(ctx);
      if (!rightResult.isOk) return rightResult;
      left = {
        isOk: true,
        value: {
          type: "BinaryExpression",
          operator: op as "*" | "/" | "%",
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
  if (token.type === "LPAREN")
    return parsePrimaryWithChain(ctx, parseParenOrTupleExpr);
  return unexpectedTokenError(
    token,
    "a number, string, identifier, boolean, or '('",
  );
}

function parseRemainingTupleElements(
  ctx: ParseContext,
  elements: Expression[],
): Result<Expression[], CompileError> {
  while (true) {
    const next = peek(ctx);
    if (next && next.type === "RPAREN") {
      consume(ctx);
      break;
    }
    const elemResult = parseExpression(ctx);
    if (!elemResult.isOk) return elemResult;
    elements.push(elemResult.value);
    const comma = peek(ctx);
    if (comma && comma.type === "COMMA") consume(ctx);
  }
  return { isOk: true, value: elements };
}

function parseParenOrTupleExpr(
  ctx: ParseContext,
): Result<Expression, CompileError> {
  consume(ctx);
  const firstResult = parseExpression(ctx);
  if (!firstResult.isOk) return firstResult;
  const after = peek(ctx);
  if (after && after.type === "COMMA") {
    consume(ctx);
    const elementsResult = parseRemainingTupleElements(ctx, [
      firstResult.value,
    ]);
    if (!elementsResult.isOk) return elementsResult;
    return {
      isOk: true,
      value: { type: "TupleExpr", elements: elementsResult.value },
    };
  }
  const rpErr = expectRParen(ctx);
  if (!rpErr.isOk) return rpErr;
  return firstResult;
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
  const line = token.line;
  const column = token.column;

  const next = peek(ctx);
  if (next && next.type === "DOUBLE_COLON") {
    return parseModuleAccessHelper(ctx, name, line, column);
  }

  const typeArgs = parseOptionalTypeArgs(ctx);
  if (!typeArgs.isOk) return typeArgs;

  const after = peek(ctx);
  if (after && after.type === "LBRACE") {
    return parseStructWithIs(ctx, name, typeArgs.value);
  }

  if (after && after.type === "LPAREN") {
    return parseFunctionCallWithIs(ctx, name, typeArgs.value, line, column);
  }

  const expr: Expression = { type: "Identifier", name };
  const memberResult = parseMemberChain(ctx, expr);
  if (!memberResult.isOk) return memberResult;
  const isResult = parseIsExpression(ctx, memberResult.value);
  if (!isResult.isOk) return isResult;
  return { isOk: true, value: isResult.value };
}

function parseFunctionCallWithIs(
  ctx: ParseContext,
  name: string,
  typeArgs: string[],
  line: number,
  column: number,
): Result<Expression, CompileError> {
  const callResult = parseFunctionCall(ctx, name, typeArgs, line, column);
  if (!callResult.isOk) return callResult;
  return parseIsExpression(ctx, callResult.value);
}

function parseFunctionCallExpr(
  ctx: ParseContext,
  name: string,
  typeArgs: string[],
  object: Expression | undefined,
  line: number,
  column: number,
): Result<Expression, CompileError> {
  consume(ctx);
  const argsResult = parseFunctionArgs(ctx);
  if (!argsResult.isOk) return argsResult;
  const call: Expression = {
    type: "FunctionCall",
    functionName: name,
    typeArgs,
    args: argsResult.value,
    line,
    column,
  };
  if (object) {
    (call as { object: Expression }).object = object;
  }
  return { isOk: true, value: call };
}

function parseFunctionCall(
  ctx: ParseContext,
  name: string,
  typeArgs: string[],
  line: number,
  column: number,
): Result<Expression, CompileError> {
  return parseFunctionCallExpr(ctx, name, typeArgs, undefined, line, column);
}

function parseFunctionArgs(
  ctx: ParseContext,
): Result<Expression[], CompileError> {
  const args: Expression[] = [];
  const next = peek(ctx);
  if (next && next.type === "RPAREN") {
    consume(ctx);
    return { isOk: true, value: args };
  }
  const firstResult = parseExpression(ctx);
  if (!firstResult.isOk) return firstResult;
  args.push(firstResult.value);
  while (true) {
    const comma = peek(ctx);
    if (comma && comma.type === "COMMA") {
      consume(ctx);
      const argResult = parseExpression(ctx);
      if (!argResult.isOk) return argResult;
      args.push(argResult.value);
    } else break;
  }
  const rpErr = expectRParen(ctx);
  if (!rpErr.isOk) return rpErr;
  return { isOk: true, value: args };
}

function parseStructWithIs(
  ctx: ParseContext,
  name: string,
  typeArgs: string[],
): Result<Expression, CompileError> {
  const structResult = parseStructInstance(ctx, name, typeArgs);
  if (!structResult.isOk) return structResult;
  const isResult = parseIsExpression(ctx, structResult.value);
  if (!isResult.isOk) return isResult;
  return { isOk: true, value: isResult.value };
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

function parseMemberChain(
  ctx: ParseContext,
  expr: Expression,
): Result<Expression, CompileError> {
  let current: Expression = expr;
  while (true) {
    const dot = peek(ctx);
    if (dot && dot.value === ".") {
      const memberResult = parseNextMember(ctx, current);
      if (!memberResult.isOk) return memberResult;
      current = memberResult.value;
    } else break;
  }
  return { isOk: true, value: current };
}

function parseNextMember(
  ctx: ParseContext,
  current: Expression,
): Result<Expression, CompileError> {
  consume(ctx);
  const fieldToken = peek(ctx);
  if (!fieldToken)
    return unexpectedTokenError(
      { type: "EOF", value: "", line: 0, column: 0 },
      "field name or index",
    );
  if (fieldToken.type !== "IDENTIFIER" && fieldToken.type !== "NUMBER") {
    return unexpectedTokenError(fieldToken, "field name or index");
  }
  consume(ctx);
  const field = fieldToken.value;
  const line = fieldToken.line;
  const column = fieldToken.column;
  current = { type: "MemberExpression", object: current, field };
  const typeArgsResult = parseOptionalTypeArgs(ctx);
  if (!typeArgsResult.isOk) return typeArgsResult;
  const after = peek(ctx);
  if (after && after.type === "LPAREN") {
    return parseFunctionCallExpr(
      ctx,
      field,
      typeArgsResult.value,
      current,
      line,
      column,
    );
  }
  return { isOk: true, value: current };
}

function expectToken(
  ctx: ParseContext,
  type: string,
  expected: string,
): Result<Token, CompileError> {
  return expectTokenHelper(ctx, type, expected);
}
