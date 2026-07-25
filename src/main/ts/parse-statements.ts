import type {
  Token,
  Result,
  CompileError,
  IsExpressionExpr,
  StructField,
  Expression,
  Statement,
  NumberLiteralExpr,
  IdentifierExpr,
  MemberExpressionExpr,
} from "./types";
import type { ParseContext } from "./parse-expressions";
import {
  parseExpression,
  parseBracketedList,
  parseTypeNameWithGenerics,
  peek,
  consume,
} from "./parse-expressions";
import {
  expectToken as expectTokenHelper,
  unexpectedEofError,
  unexpectedTokenError,
} from "./parse-helpers";

function expectToken(
  ctx: ParseContext,
  type: string,
  expected: string,
): Result<Token, CompileError> {
  return expectTokenHelper(ctx, type, expected);
}

export function parseStatement(
  ctx: ParseContext,
): Result<Statement, CompileError> {
  const token = peek(ctx);
  if (!token) return unexpectedEofError("a statement");
  if (token.type === "IDENTIFIER" && token.value === "let")
    return parseLetStatement(ctx, token);
  if (token.type === "IDENTIFIER" && token.value === "struct")
    return parseStructDefinition(ctx, token);
  if (token.type === "IDENTIFIER" && token.value === "type")
    return parseTypeAlias(ctx, token);
  return parseAssignmentStatement(ctx);
}

function parseLetStatement(
  ctx: ParseContext,
  letToken: Token,
): Result<Statement, CompileError> {
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
  if (!equalsResult.isOk) {
    if (expr.type === "MemberExpression")
      return { isOk: true, value: expr as MemberExpressionExpr };
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
  if (expr.type === "MemberExpression")
    return parseMemberAssignment(
      ctx,
      expr as MemberExpressionExpr,
      token.line,
      token.column,
    );
  return parseSimpleAssign(ctx, expr as IdentifierExpr, token);
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
  if (expr.type === "LogicalExpression" || expr.type === "NotExpression")
    return { isOk: true, value: expr as Statement };
  if (expr.type === "IsExpression")
    return { isOk: true, value: expr as IsExpressionExpr };
  if (expr.type === "StructInstance")
    return { isOk: true, value: makeNumLiteralStmt(0, token) };
  if (expr.type === "TupleExpr")
    return { isOk: true, value: makeNumLiteralStmt(0, token) };
  if (expr.type === "StringLiteral") {
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
  return null;
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

function parseNameWithTypeParams(
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

function parseStructDefinition(
  ctx: ParseContext,
  structToken: Token,
): Result<Statement, CompileError> {
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
      fields: fieldsResult.value,
      line: structToken.line,
      column: structToken.column,
    },
  };
}

function consumeOptionalSemicolon(ctx: ParseContext) {
  const next = peek(ctx);
  if (next && next.type === "SEMICOLON") consume(ctx);
}

function parseTypeAlias(
  ctx: ParseContext,
  typeToken: Token,
): Result<Statement, CompileError> {
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
      line: typeToken.line,
      column: typeToken.column,
    },
  };
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
