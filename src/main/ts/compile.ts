import { tokenize } from "./tokenize";
import type {
  Token,
  Result,
  CompileError,
  Err,
  StructField,
  StructDefinitionNode,
  MemberAssignmentNode,
  LetDeclarationNode,
  AssignmentNode,
  IdentifierNode,
  NumberLiteralNode,
} from "./types";

// --- Parser ---

interface NumberLiteralExpr {
  type: "NumberLiteral";
  value: number;
  typeName?: string;
}

interface IdentifierExpr {
  type: "Identifier";
  name: string;
  typeName?: string;
}

interface StructInstanceExpr {
  type: "StructInstance";
  structName: string;
  fields: { name: string; value: Expression }[];
}

interface MemberExpr {
  type: "MemberExpression";
  object: Expression;
  field: string;
}

type Expression =
  NumberLiteralExpr | IdentifierExpr | StructInstanceExpr | MemberExpr;
type Statement =
  | NumberLiteralNode
  | IdentifierNode
  | LetDeclarationNode
  | AssignmentNode
  | StructDefinitionNode
  | MemberAssignmentNode;

interface ParseContext {
  tokens: Token[];
  pos: number;
}

function parse(tokens: Token[]): Result<Statement[], CompileError> {
  const ctx: ParseContext = { tokens, pos: 0 };
  const statements: Statement[] = [];
  while (!isEof(ctx)) {
    const stmt = parseStatement(ctx);
    if (!stmt.isOk) return stmt;
    statements.push(stmt.value);
  }
  return { isOk: true, value: statements };
}

function isEof(ctx: ParseContext): boolean {
  return ctx.pos >= ctx.tokens.length;
}

function peek(ctx: ParseContext): Token | undefined {
  return ctx.tokens[ctx.pos];
}

function consume(ctx: ParseContext): Token {
  return ctx.tokens[ctx.pos++]!;
}

function unexpectedTokenError(
  token: Token,
  expected: string,
): Err<CompileError> {
  return {
    isOk: false,
    error: {
      message: `Unexpected token: '${token.value}'`,
      reason: `Expected ${expected}.`,
      suggestedFix: "Use a supported expression.",
      line: token.line,
      column: token.column,
    },
  };
}

function unexpectedEofError(expected: string): Err<CompileError> {
  return {
    isOk: false,
    error: {
      message: "Unexpected end of input",
      reason: `Expected ${expected}.`,
      suggestedFix: "Add a valid expression.",
      line: 0,
      column: 0,
    },
  };
}

function parseExpression(ctx: ParseContext): Result<Expression, CompileError> {
  const token = peek(ctx);
  if (!token) return unexpectedEofError("an expression");
  if (token.type === "NUMBER") return parseNumberLiteral(ctx);
  if (token.type === "IDENTIFIER") return parseIdentifierExpression(ctx);
  return unexpectedTokenError(token, "a number or identifier");
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

  // Check for struct instance: Name { field: value, ... }
  const next = peek(ctx);
  if (next && next.type === "LBRACE") return parseStructInstance(ctx, name);

  // Check for member access: obj.field
  let expr: Expression = { type: "Identifier", name };
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
      expr = {
        type: "MemberExpression",
        object: expr,
        field: fieldToken.value,
      };
    } else {
      break;
    }
  }
  return { isOk: true, value: expr };
}

function parseStructInstance(
  ctx: ParseContext,
  structName: string,
): Result<Expression, CompileError> {
  consume(ctx); // consume '{'
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
      if (after && after.type === "COMMA") {
        consume(ctx);
        continue;
      }
    } else {
      return unexpectedTokenError(next, "field name or '}'");
    }
  }
  return {
    isOk: true,
    value: { type: "StructInstance", structName, fields },
  };
}

function parseStructDefinition(
  ctx: ParseContext,
  structToken: Token,
): Result<Statement, CompileError> {
  consume(ctx); // consume 'struct'
  const nameToken = peek(ctx);
  if (!nameToken || nameToken.type !== "IDENTIFIER")
    return unexpectedTokenError(
      nameToken || { type: "EOF", value: "", line: 0, column: 0 },
      "struct name",
    );
  const structName = nameToken.value;
  consume(ctx);

  const lbraceResult = expectToken(ctx, "LBRACE", "{");
  if (!lbraceResult.isOk) return lbraceResult;

  const fieldsResult = parseStructFields(ctx);
  if (!fieldsResult.isOk) return fieldsResult;

  const semiResult = expectToken(ctx, "SEMICOLON", ";");
  if (!semiResult.isOk) return semiResult;

  return {
    isOk: true,
    value: {
      type: "StructDefinition",
      name: structName,
      fields: fieldsResult.value,
      line: structToken.line,
      column: structToken.column,
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
    const fieldResult = parseStructField(ctx);
    if (!fieldResult.isOk) return fieldResult;
    fields.push(fieldResult.value);
    const after = peek(ctx);
    if (after && after.type === "COMMA") {
      consume(ctx);
      continue;
    }
  }
  return { isOk: true, value: fields };
}

function parseStructField(
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

  const typeToken = peek(ctx);
  if (!typeToken || typeToken.type !== "IDENTIFIER")
    return unexpectedTokenError(
      typeToken || { type: "EOF", value: "", line: 0, column: 0 },
      "field type",
    );
  const typeName = typeToken.value;
  consume(ctx);
  return { isOk: true, value: { name: fieldName, typeName } };
}

function parseMemberAssignment(
  ctx: ParseContext,
  expr: MemberExpr,
  line: number,
  column: number,
): Result<Statement, CompileError> {
  const rhsResult = parseExpression(ctx);
  if (!rhsResult.isOk) return rhsResult;
  const semiResult = expectToken(ctx, "SEMICOLON", ";");
  if (!semiResult.isOk) return semiResult;
  return {
    isOk: true,
    value: {
      type: "MemberAssignment",
      object: expr.object,
      field: expr.field,
      value: rhsResult.value,
      line,
      column,
    },
  };
}

function expectToken(
  ctx: ParseContext,
  type: string,
  expected: string,
): Result<Token, CompileError> {
  const token = peek(ctx);
  if (!token)
    return {
      isOk: false,
      error: {
        message: `Expected '${expected}'`,
        reason: `Missing ${expected}.`,
        suggestedFix: `Add '${expected}'.`,
        line: 0,
        column: 0,
      },
    };
  if (token.type !== type)
    return {
      isOk: false,
      error: {
        message: `Expected '${expected}', got '${token.value}'`,
        reason: `Unexpected token.`,
        suggestedFix: `Use '${expected}'.`,
        line: token.line,
        column: token.column,
      },
    };
  consume(ctx);
  return { isOk: true, value: token };
}

function expectVariableName(ctx: ParseContext): Result<Token, CompileError> {
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
          ? `Expected variable name after 'let', got '${nameToken.value}'`
          : "Expected variable name after 'let'",
        reason: "Let declarations require a variable name.",
        suggestedFix: "Use 'let <name> = <expression>;'.",
        line: nameToken?.line ?? 0,
        column: nameToken?.column ?? 0,
      },
    };
  consume(ctx);
  return { isOk: true, value: nameToken };
}

function parseTypeAnnotation(
  ctx: ParseContext,
): Result<string | undefined, CompileError> {
  const colonToken = peek(ctx);
  if (!colonToken || colonToken.type !== "COLON")
    return { isOk: true, value: undefined };
  consume(ctx);
  const typeToken = peek(ctx);
  if (!typeToken || typeToken.type !== "IDENTIFIER")
    return unexpectedTokenError(
      typeToken || { type: "EOF", value: "", line: 0, column: 0 },
      "type name",
    );
  const typeName = typeToken.value;
  consume(ctx);
  return { isOk: true, value: typeName };
}

function parseLetStatement(
  ctx: ParseContext,
  letToken: Token,
): Result<Statement, CompileError> {
  consume(ctx);
  const mutable = peek(ctx)?.value === "mut";
  if (mutable) consume(ctx);
  const nameResult = expectVariableName(ctx);
  if (!nameResult.isOk) return nameResult;

  const typeResult = parseTypeAnnotation(ctx);
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
      name: nameResult.value.value,
      mutable,
      typeName,
      value: exprResult.value,
      line: letToken.line,
      column: letToken.column,
    },
  };
}

function parseAssignmentStatement(
  ctx: ParseContext,
): Result<Statement, CompileError> {
  const token = peek(ctx);
  if (!token) return unexpectedEofError("a statement");
  const exprResult = parseExpression(ctx);
  if (!exprResult.isOk) return exprResult;
  const expr = exprResult.value;
  if (expr.type === "NumberLiteral") return parseNumberStatement(expr, token);
  if (expr.type === "StructInstance")
    return parseStructInstanceStatement(token);
  const equalsResult = expectToken(ctx, "EQUALS", "=");
  if (!equalsResult.isOk) return parseExpressionAsIdentifier(expr, token);
  if (expr.type === "MemberExpression")
    return parseMemberAssignment(ctx, expr, token.line, token.column);
  return parseRegularAssignment(ctx, expr, token);
}

function parseNumberStatement(
  expr: NumberLiteralExpr,
  token: Token,
): Result<Statement, CompileError> {
  return {
    isOk: true,
    value: {
      type: "NumberLiteral",
      value: expr.value,
      line: token.line,
      column: token.column,
    },
  };
}

function parseStructInstanceStatement(
  token: Token,
): Result<Statement, CompileError> {
  return {
    isOk: true,
    value: {
      type: "Identifier",
      name: "_",
      line: token.line,
      column: token.column,
    },
  };
}

function parseExpressionAsIdentifier(
  expr: Expression,
  token: Token,
): Result<Statement, CompileError> {
  const name =
    expr.type === "MemberExpression"
      ? getMemberName(expr)
      : (expr as IdentifierExpr).name;
  return {
    isOk: true,
    value: {
      type: "Identifier",
      name,
      line: token.line,
      column: token.column,
    },
  };
}

function parseRegularAssignment(
  ctx: ParseContext,
  expr: IdentifierExpr,
  token: Token,
): Result<Statement, CompileError> {
  const rhsResult = parseExpression(ctx);
  if (!rhsResult.isOk) return rhsResult;
  const semiResult = expectToken(ctx, "SEMICOLON", ";");
  if (!semiResult.isOk) return semiResult;
  return {
    isOk: true,
    value: {
      type: "Assignment",
      name: expr.name,
      value: rhsResult.value,
      line: token.line,
      column: token.column,
    },
  };
}

function getMemberName(expr: Expression): string {
  if (expr.type === "MemberExpression") {
    const objName = getMemberName(expr.object);
    return `${objName}.${expr.field}`;
  }
  if (expr.type === "Identifier") return expr.name;
  return "_";
}

function parseStatement(ctx: ParseContext): Result<Statement, CompileError> {
  const token = peek(ctx);
  if (!token) return unexpectedEofError("a statement");

  if (token.type === "IDENTIFIER" && token.value === "let") {
    return parseLetStatement(ctx, token);
  }

  if (token.type === "IDENTIFIER" && token.value === "struct") {
    return parseStructDefinition(ctx, token);
  }

  return parseAssignmentStatement(ctx);
}

// --- Compiler Entry Point ---

import { analyzeSemantics } from "./semantic";
import { generateCode } from "./generate";

export function compileTuffToTS(
  tuffSource: string,
): Result<string, CompileError> {
  if (tuffSource.length === 0) return { isOk: true, value: "process.exit(0)" };
  const tokensResult = tokenize(tuffSource);
  if (!tokensResult.isOk) return tokensResult;
  const statementsResult = parse(tokensResult.value);
  if (!statementsResult.isOk) return statementsResult;
  const semanticResult = analyzeSemantics(statementsResult.value);
  if (!semanticResult.isOk) return semanticResult;
  const code = generateCode(semanticResult.value);
  return { isOk: true, value: code };
}
