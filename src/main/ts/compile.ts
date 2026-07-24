export interface Ok<T> {
  isOk: true;
  value: T;
}

export interface Err<X> {
  isOk: false;
  error: X;
}

export type Result<T, X> = Ok<T> | Err<X>;

export interface CompileError {
  message: string;
  reason: string;
  suggestedFix: string;
  line: number;
  column: number;
}

// --- Tokenizer ---

export interface Token {
  type: string;
  value: string;
  line: number;
  column: number;
}

interface TokenizeContext {
  source: string;
  pos: number;
  line: number;
  column: number;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isAlpha(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isIdentChar(ch: string): boolean {
  return isDigit(ch) || isAlpha(ch);
}

function readNumber(ctx: TokenizeContext): Token {
  let numStr = "";
  while (ctx.pos < ctx.source.length) {
    const c = ctx.source[ctx.pos];
    if (!c || !isDigit(c)) break;
    numStr += c;
    ctx.pos++;
    ctx.column++;
  }
  return {
    type: "NUMBER",
    value: numStr,
    line: ctx.line,
    column: ctx.column,
  };
}

function readIdentifier(ctx: TokenizeContext): Token {
  let ident = "";
  while (ctx.pos < ctx.source.length) {
    const c = ctx.source[ctx.pos];
    if (!c || !isIdentChar(c)) break;
    ident += c;
    ctx.pos++;
    ctx.column++;
  }
  return {
    type: "IDENTIFIER",
    value: ident,
    line: ctx.line,
    column: ctx.column,
  };
}

function tokenizeOperator(ch: string, ctx: TokenizeContext): Token {
  return {
    type: ch === "=" ? "EQUALS" : "SEMICOLON",
    value: ch,
    line: ctx.line,
    column: ctx.column,
  };
}

function tokenizeUnknown(ch: string, ctx: TokenizeContext): Err<CompileError> {
  return {
    isOk: false,
    error: {
      message: `Unexpected character: '${ch}'`,
      reason: "Only digits, identifiers, and operators are supported.",
      suggestedFix: "Remove unsupported characters.",
      line: ctx.line,
      column: ctx.column,
    },
  };
}

function skipWhitespace(ctx: TokenizeContext): boolean {
  const ch = ctx.source[ctx.pos];
  if (ch === " " || ch === "\t" || ch === "\r") {
    ctx.pos++;
    ctx.column++;
    return true;
  }
  if (ch === "\n") {
    ctx.pos++;
    ctx.line++;
    ctx.column = 1;
    return true;
  }
  return false;
}

function tokenize(source: string): Result<Token[], CompileError> {
  const tokens: Token[] = [];
  const ctx: TokenizeContext = {
    source,
    pos: 0,
    line: 1,
    column: 1,
  };

  while (ctx.pos < ctx.source.length) {
    const ch = ctx.source[ctx.pos];
    if (!ch) break;
    if (skipWhitespace(ctx)) continue;

    if (isDigit(ch)) {
      const startCol = ctx.column;
      const token = readNumber(ctx);
      token.column = startCol;
      token.line = ctx.line;
      tokens.push(token);
      continue;
    }

    if (ch === "=" || ch === ";") {
      tokens.push(tokenizeOperator(ch, ctx));
      ctx.pos++;
      ctx.column++;
      continue;
    }

    if (isAlpha(ch)) {
      const startCol = ctx.column;
      const token = readIdentifier(ctx);
      token.column = startCol;
      token.line = ctx.line;
      tokens.push(token);
      continue;
    }

    return tokenizeUnknown(ch, ctx);
  }

  return { isOk: true, value: tokens };
}

// --- Parser ---

interface ASTNode {
  type: string;
}

interface NumberLiteralNode extends ASTNode {
  type: "NumberLiteral";
  value: number;
  line: number;
  column: number;
}

interface IdentifierNode extends ASTNode {
  type: "Identifier";
  name: string;
  line: number;
  column: number;
}

interface LetDeclarationNode extends ASTNode {
  type: "LetDeclaration";
  name: string;
  value: Expression;
  line: number;
  column: number;
}

interface ExpressionNode {
  type: string;
}

interface NumberLiteralExpr extends ExpressionNode {
  type: "NumberLiteral";
  value: number;
}

interface IdentifierExpr extends ExpressionNode {
  type: "Identifier";
  name: string;
}

export type Expression = NumberLiteralExpr | IdentifierExpr;

export type Statement = NumberLiteralNode | IdentifierNode | LetDeclarationNode;

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
  const token = ctx.tokens[ctx.pos++];
  return token!;
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

  if (token.type === "NUMBER") {
    consume(ctx);
    return {
      isOk: true,
      value: { type: "NumberLiteral", value: parseInt(token.value, 10) },
    };
  }

  if (token.type === "IDENTIFIER") {
    consume(ctx);
    return { isOk: true, value: { type: "Identifier", name: token.value } };
  }

  return unexpectedTokenError(token, "a number or identifier");
}

function expectToken(
  ctx: ParseContext,
  type: string,
  expected: string,
): Result<Token, CompileError> {
  const token = peek(ctx);
  if (!token) {
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
  }
  if (token.type !== type) {
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
  }
  consume(ctx);
  return { isOk: true, value: token };
}

function expectVariableName(
  ctx: ParseContext,
): Result<Token, CompileError> {
  const nameToken = peek(ctx);
  if (
    !nameToken ||
    nameToken.type !== "IDENTIFIER" ||
    nameToken.value === "let"
  ) {
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
  }
  consume(ctx);
  return { isOk: true, value: nameToken };
}

function parseLetStatement(
  ctx: ParseContext,
  letToken: Token,
): Result<Statement, CompileError> {
  consume(ctx);

  const nameResult = expectVariableName(ctx);
  if (!nameResult.isOk) return nameResult;

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
      value: exprResult.value,
      line: letToken.line,
      column: letToken.column,
    },
  };
}

function parseExpressionStatement(
  ctx: ParseContext,
): Result<Statement, CompileError> {
  const token = peek(ctx);
  if (!token) return unexpectedEofError("a statement");

  const exprResult = parseExpression(ctx);
  if (!exprResult.isOk) return exprResult;

  const expr = exprResult.value;
  if (expr.type === "NumberLiteral") {
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

  return {
    isOk: true,
    value: {
      type: "Identifier",
      name: expr.name,
      line: token.line,
      column: token.column,
    },
  };
}

function parseStatement(ctx: ParseContext): Result<Statement, CompileError> {
  const token = peek(ctx);
  if (!token) return unexpectedEofError("a statement");

  if (token.type === "IDENTIFIER" && token.value === "let") {
    return parseLetStatement(ctx, token);
  }

  return parseExpressionStatement(ctx);
}

// --- Code Generator ---

function generateExpression(expr: Expression): string {
  if (expr.type === "NumberLiteral") {
    return String(expr.value);
  }
  return expr.name;
}

function generateCode(statements: Statement[]): string {
  const lines: string[] = [];

  for (const stmt of statements) {
    if (stmt.type === "NumberLiteral") {
      const node = stmt as NumberLiteralNode;
      lines.push(`process.exit(${node.value})`);
    } else if (stmt.type === "Identifier") {
      const node = stmt as IdentifierNode;
      lines.push(`process.exit(${node.name})`);
    } else if (stmt.type === "LetDeclaration") {
      const node = stmt as LetDeclarationNode;
      lines.push(`let ${node.name} = ${generateExpression(node.value)}`);
    }
  }

  return lines.join("\n");
}

// --- Compiler Entry Point ---

export function compileTuffToTS(
  tuffSource: string,
): Result<string, CompileError> {
  if (tuffSource.length === 0)
    return {
      isOk: true,
      value: "process.exit(0)",
    };

  const tokensResult = tokenize(tuffSource);
  if (!tokensResult.isOk) return tokensResult;

  const statementsResult = parse(tokensResult.value);
  if (!statementsResult.isOk) return statementsResult;

  const code = generateCode(statementsResult.value);

  return { isOk: true, value: code };
}
