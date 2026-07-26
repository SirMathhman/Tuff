import type {
  Token,
  Result,
  CompileError,
  Expression,
  Statement,
  NumberLiteralExpr,
  IdentifierExpr,
  MemberExpressionExpr,
} from "./types";
import type { ParseContext } from "./parse-expressions";
import {
  parseExpression,
  peek,
  consume,
  expectRParen,
} from "./parse-expressions";
import {
  expectToken as expectTokenHelper,
  unexpectedEofError,
  unexpectedTokenError,
} from "./parse-helpers";
import { parseEnumDefinition } from "./parse-enums";
import {
  parseStructDefinition,
  parseTypeAlias,
  parseNameWithTypeParams,
} from "./parse-struct-defs";
import { parseTypeNameWithGenerics } from "./parse-type-expressions";

function expectToken(
  ctx: ParseContext,
  type: string,
  expected: string,
): Result<Token, CompileError> {
  return expectTokenHelper(ctx, type, expected);
}

function tryParseOutStatement(
  ctx: ParseContext,
): Result<Statement, CompileError> | undefined {
  if (peek(ctx)?.type !== "OUT") return undefined;
  consume(ctx);
  const next = peek(ctx);
  if (!next) return unexpectedEofError("a declaration after 'out'");
  return parseOutStatementBody(ctx, next);
}

function parseOutStatementBody(
  ctx: ParseContext,
  next: Token,
): Result<Statement, CompileError> {
  if (next.type === "IDENTIFIER" && next.value === "let")
    return parseLetStatement(ctx, true);
  if (next.type === "IDENTIFIER" && next.value === "struct")
    return parseStructDefinition(ctx, true);
  if (next.type === "IDENTIFIER" && next.value === "type")
    return parseTypeAlias(ctx, true);
  if (next.type === "ENUM") return parseEnumDefinition(ctx, true);
  if (next.type === "FN") return parseFunctionDefinition(ctx, true);
  return unexpectedTokenError(
    next,
    "let, struct, type, enum, or fn after 'out'",
  );
}

function dispatchStatementKind(
  ctx: ParseContext,
  token: Token,
): Result<Statement, CompileError> {
  if (token.type === "IDENTIFIER" && token.value === "let")
    return parseLetStatement(ctx, false);
  if (token.type === "IDENTIFIER" && token.value === "struct")
    return parseStructDefinition(ctx, false);
  if (token.type === "IDENTIFIER" && token.value === "type")
    return parseTypeAlias(ctx, false);
  if (token.type === "ENUM") return parseEnumDefinition(ctx, false);
  if (token.type === "FN") return parseFunctionDefinition(ctx, false);
  return parseAssignmentStatement(ctx);
}

export function parseStatement(
  ctx: ParseContext,
): Result<Statement, CompileError> {
  const outResult = tryParseOutStatement(ctx);
  if (outResult !== undefined) return outResult;
  const token = peek(ctx);
  if (!token) return unexpectedEofError("a statement");
  return dispatchStatementKind(ctx, token);
}

function parseLetStatement(
  ctx: ParseContext,
  exported: boolean,
): Result<Statement, CompileError> {
  const letToken = peek(ctx);
  if (!letToken) return unexpectedEofError("let");
  consume(ctx);
  const mutable = peek(ctx)?.value === "mut";
  if (mutable) consume(ctx);
  const nameResult = parseLetName(ctx);
  if (!nameResult.isOk) return nameResult;
  const name = nameResult.value;
  const typeResult = parseLetType(ctx);
  if (!typeResult.isOk) return typeResult;
  const typeName = typeResult.value;
  const equalsResult = expectToken(ctx, "EQUALS", "=");
  if (!equalsResult.isOk) return equalsResult;
  const exprResult = parseExpression(ctx);
  if (!exprResult.isOk) return exprResult;
  const semiResult = expectToken(ctx, "SEMICOLON", ";");
  if (!semiResult.isOk) return semiResult;
  return {
    isOk: true,
    value: {
      type: "LetDeclaration",
      name,
      mutable,
      exported,
      typeName,
      value: exprResult.value,
      line: letToken.line,
      column: letToken.column,
    },
  };
}

function parseLetName(ctx: ParseContext): Result<string, CompileError> {
  const nameToken = peek(ctx);
  if (
    !nameToken ||
    nameToken.type !== "IDENTIFIER" ||
    nameToken.value === "let"
  )
    return {
      isOk: false,
      error: {
        message: nameToken
          ? "Expected variable name after 'let', got '" + nameToken.value + "'"
          : "Expected variable name after 'let'",
        reason: "Let declarations require a variable name.",
        suggestedFix: "Use 'let <name> = <expression>;'.",
        line: nameToken?.line ?? 0,
        column: nameToken?.column ?? 0,
      },
    };
  consume(ctx);
  return { isOk: true, value: nameToken.value };
}

function parseLetType(
  ctx: ParseContext,
): Result<string | undefined, CompileError> {
  const colonToken = peek(ctx);
  if (!colonToken || colonToken.type !== "COLON")
    return { isOk: true, value: undefined };
  consume(ctx);
  if (peek(ctx)?.type === "AMPERSAND") consume(ctx);
  const typeResult = parseTypeNameWithGenerics(ctx);
  if (!typeResult.isOk) return typeResult;
  return { isOk: true, value: typeResult.value };
}

function parseAssignmentStatement(
  ctx: ParseContext,
): Result<Statement, CompileError> {
  const token = peek(ctx);
  if (!token) return unexpectedEofError("a statement");
  const exprResult = parseExpression(ctx);
  if (!exprResult.isOk) return exprResult;
  const expr = exprResult.value;
  const early = parseEarlyReturn(expr, token);
  if (early) return early;
  const equalsResult = expectToken(ctx, "EQUALS", "=");
  if (!equalsResult.isOk) return handleNoEquals(expr, token);
  if (expr.type === "MemberExpression")
    return parseMemberAssignment(
      ctx,
      expr as MemberExpressionExpr,
      token.line,
      token.column,
    );
  return parseSimpleAssign(ctx, expr as IdentifierExpr, token);
}

function handleNoEquals(
  expr: Expression,
  token: Token,
): Result<Statement, CompileError> {
  if (expr.type === "MemberExpression")
    return { isOk: true, value: expr as MemberExpressionExpr };
  if (expr.type === "ModuleAccess")
    return { isOk: true, value: expr as Statement };
  if (
    expr.type === "FunctionCall" ||
    expr.type === "BinaryExpression" ||
    expr.type === "IsExpression"
  )
    return { isOk: true, value: expr as Statement };
  return {
    isOk: true,
    value: {
      type: "Identifier",
      name: (expr as IdentifierExpr).name,
      line: token.line,
      column: token.column,
    },
  };
}

function parseFunctionDefinition(
  ctx: ParseContext,
  exported: boolean,
): Result<Statement, CompileError> {
  const fnToken = peek(ctx);
  if (!fnToken) return unexpectedEofError("fn");
  consume(ctx);

  const nameResult = parseFunctionName(ctx);
  if (!nameResult.isOk) return nameResult;
  const name = nameResult.value.name;
  const typeParams = nameResult.value.typeParams;

  const lpErr = expectToken(ctx, "LPAREN", "(");
  if (!lpErr.isOk) return lpErr;
  const paramsResult = parseFunctionParams(ctx);
  if (!paramsResult.isOk) return paramsResult;
  const params = paramsResult.value;

  const returnTypeResult = parseFunctionReturnType(ctx);
  if (!returnTypeResult.isOk) return returnTypeResult;

  const fatArrowErr = expectToken(ctx, "FAT_ARROW", "=>");
  if (!fatArrowErr.isOk) return fatArrowErr;

  const bodyResult = parseFunctionBody(ctx);
  if (!bodyResult.isOk) return bodyResult;

  return {
    isOk: true,
    value: {
      type: "FunctionDefinition",
      name,
      typeParams,
      params,
      returnType: returnTypeResult.value,
      body: bodyResult.value,
      exported,
      line: fnToken.line,
      column: fnToken.column,
    },
  };
}

function parseFunctionReturnType(
  ctx: ParseContext,
): Result<string, CompileError> {
  const colonErr = expectToken(ctx, "COLON", ":");
  if (!colonErr.isOk) return colonErr;
  if (peek(ctx)?.type === "AMPERSAND") consume(ctx);
  return parseTypeNameWithGenerics(ctx);
}

function parseFunctionName(
  ctx: ParseContext,
): Result<{ name: string; typeParams: string[] }, CompileError> {
  return parseNameWithTypeParams(ctx, "function name");
}

function parseFunctionParams(
  ctx: ParseContext,
): Result<{ name: string; typeName: string }[], CompileError> {
  const params: { name: string; typeName: string }[] = [];
  const next = peek(ctx);
  if (next && next.type === "RPAREN") {
    consume(ctx);
    return { isOk: true, value: params };
  }
  const firstResult = parseSingleParam(ctx);
  if (!firstResult.isOk) return firstResult;
  params.push(firstResult.value);
  while (true) {
    const comma = peek(ctx);
    if (comma && comma.type === "COMMA") {
      consume(ctx);
      const paramResult = parseSingleParam(ctx);
      if (!paramResult.isOk) return paramResult;
      params.push(paramResult.value);
    } else break;
  }
  const rpErr = expectRParen(ctx);
  if (!rpErr.isOk) return rpErr;
  return { isOk: true, value: params };
}

function parseSingleParam(
  ctx: ParseContext,
): Result<{ name: string; typeName: string }, CompileError> {
  const nameToken = peek(ctx);
  if (!nameToken || nameToken.type !== "IDENTIFIER")
    return unexpectedTokenError(
      nameToken || { type: "EOF", value: "", line: 0, column: 0 },
      "parameter name",
    );
  const paramName = nameToken.value;
  consume(ctx);
  const colonErr = expectToken(ctx, "COLON", ":");
  if (!colonErr.isOk) return colonErr;
  if (peek(ctx)?.type === "AMPERSAND") consume(ctx);
  const typeResult = parseTypeNameWithGenerics(ctx);
  if (!typeResult.isOk) return typeResult;
  return { isOk: true, value: { name: paramName, typeName: typeResult.value } };
}

function parseFunctionBody(
  ctx: ParseContext,
): Result<Statement[], CompileError> {
  const next = peek(ctx);
  if (next && next.type === "LBRACE") {
    return parseBlockBody(ctx);
  }
  return parseExpressionBody(ctx);
}

function parseBlockBody(ctx: ParseContext): Result<Statement[], CompileError> {
  consume(ctx);
  const statements: Statement[] = [];
  while (true) {
    const next = peek(ctx);
    if (!next) return unexpectedEofError("'}'");
    if (next.type === "RBRACE") {
      consume(ctx);
      break;
    }
    const stmtResult = parseStatement(ctx);
    if (!stmtResult.isOk) return stmtResult;
    statements.push(stmtResult.value);
  }
  return { isOk: true, value: statements };
}

function parseExpressionBody(
  ctx: ParseContext,
): Result<Statement[], CompileError> {
  const exprResult = parseExpression(ctx);
  if (!exprResult.isOk) return exprResult;
  return { isOk: true, value: [exprResult.value as Statement] };
}

function makeNumLiteralStmt(value: number, token: Token): Statement {
  return {
    type: "NumberLiteral",
    value,
    line: token.line,
    column: token.column,
  };
}

function parseEarlyReturn(
  expr: Expression,
  token: Token,
): Result<Statement, CompileError> | null {
  if (expr.type === "NumberLiteral")
    return {
      isOk: true,
      value: makeNumLiteralStmt((expr as NumberLiteralExpr).value, token),
    };
  if (expr.type === "BooleanLiteral")
    return {
      isOk: true,
      value: makeNumLiteralStmt(
        (expr as { value: boolean }).value ? 1 : 0,
        token,
      ),
    };
  if (isPassThroughExpr(expr)) return { isOk: true, value: expr as Statement };
  if (isZeroReturnExpr(expr))
    return { isOk: true, value: makeNumLiteralStmt(0, token) };
  if (expr.type === "StringLiteral")
    return parseStringLiteralReturn(expr, token);
  return null;
}

function isPassThroughExpr(expr: Expression): boolean {
  return (
    expr.type === "LogicalExpression" ||
    expr.type === "NotExpression" ||
    expr.type === "IsExpression" ||
    expr.type === "ModuleAccess"
  );
}

function isZeroReturnExpr(expr: Expression): boolean {
  return expr.type === "StructInstance" || expr.type === "TupleExpr";
}

function parseStringLiteralReturn(
  expr: Expression,
  token: Token,
): Result<Statement, CompileError> {
  const sl = expr as { value: string };
  return {
    isOk: true,
    value: {
      type: "StringLiteral",
      value: sl.value,
      line: token.line,
      column: token.column,
    },
  };
}

function parseSimpleAssign(
  ctx: ParseContext,
  expr: IdentifierExpr,
  token: Token,
): Result<Statement, CompileError> {
  const bodyResult = parseAssignmentBody(ctx);
  if (!bodyResult.isOk) return bodyResult;
  return {
    isOk: true,
    value: {
      type: "Assignment",
      name: expr.name,
      value: bodyResult.value,
      line: token.line,
      column: token.column,
    },
  };
}

function parseAssignmentBody(
  ctx: ParseContext,
): Result<Expression, CompileError> {
  const rhsResult = parseExpression(ctx);
  if (!rhsResult.isOk) return rhsResult;
  const semiResult = expectToken(ctx, "SEMICOLON", ";");
  if (!semiResult.isOk) return semiResult;
  return rhsResult;
}

function parseMemberAssignment(
  ctx: ParseContext,
  expr: MemberExpressionExpr,
  line: number,
  column: number,
): Result<Statement, CompileError> {
  const bodyResult = parseAssignmentBody(ctx);
  if (!bodyResult.isOk) return bodyResult;
  return {
    isOk: true,
    value: {
      type: "MemberAssignment",
      object: expr.object,
      field: expr.field,
      value: bodyResult.value,
      line,
      column,
    },
  };
}
