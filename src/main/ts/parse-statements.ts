import type {
  Token,
  Result,
  CompileError,
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
  if (!equalsResult.isOk)
    return {
      isOk: true,
      value: {
        type: "Identifier",
        name:
          expr.type === "MemberExpression"
            ? getMemberName(expr)
            : (expr as IdentifierExpr).name,
        line: token.line,
        column: token.column,
      },
    };
  if (expr.type === "MemberExpression")
    return parseMemberAssignment(
      ctx,
      expr as MemberExpressionExpr,
      token.line,
      token.column,
    );
  return parseSimpleAssign(ctx, expr as IdentifierExpr, token);
}

function parseEarlyReturn(
  expr: Expression,
  token: Token,
): Result<Statement, CompileError> | null {
  if (expr.type === "NumberLiteral")
    return {
      isOk: true,
      value: {
        type: "NumberLiteral",
        value: (expr as NumberLiteralExpr).value,
        line: token.line,
        column: token.column,
      },
    };
  if (expr.type === "StructInstance")
    return {
      isOk: true,
      value: {
        type: "Identifier",
        name: "_",
        line: token.line,
        column: token.column,
      },
    };
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

function getMemberName(expr: Expression): string {
  if (expr.type === "MemberExpression")
    return (
      getMemberName((expr as MemberExpressionExpr).object) +
      "." +
      (expr as MemberExpressionExpr).field
    );
  if (expr.type === "Identifier") return (expr as IdentifierExpr).name;
  return "_";
}

function parseStructDefinition(
  ctx: ParseContext,
  structToken: Token,
): Result<Statement, CompileError> {
  consume(ctx);
  const nameToken = peek(ctx);
  if (!nameToken || nameToken.type !== "IDENTIFIER")
    return unexpectedTokenError(
      nameToken || { type: "EOF", value: "", line: 0, column: 0 },
      "struct name",
    );
  const structName = nameToken.value;
  consume(ctx);

  let typeParams: string[] = [];
  const afterName = peek(ctx);
  if (afterName && afterName.type === "LBRACKET") {
    consume(ctx);
    const typeParamsResult = parseBracketedList(ctx, "type parameter");
    if (!typeParamsResult.isOk) return typeParamsResult;
    typeParams = typeParamsResult.value;
  }

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
