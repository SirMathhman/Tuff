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

    // Skip whitespace
    if (ch === " " || ch === "\t" || ch === "\r") {
      ctx.pos++;
      ctx.column++;
      continue;
    }

    // Newline
    if (ch === "\n") {
      ctx.pos++;
      ctx.line++;
      ctx.column = 1;
      continue;
    }

    // Integer literal
    if (ch >= "0" && ch <= "9") {
      const startLine = ctx.line;
      const startCol = ctx.column;
      let numStr = "";
      while (ctx.pos < ctx.source.length) {
        const c = ctx.source[ctx.pos];
        if (!c || c < "0" || c > "9") break;
        numStr += c;
        ctx.pos++;
        ctx.column++;
      }
      tokens.push({
        type: "NUMBER",
        value: numStr,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // Operators and punctuation
    if (ch === "=" || ch === ";") {
      tokens.push({
        type: ch === "=" ? "EQUALS" : "SEMICOLON",
        value: ch,
        line: ctx.line,
        column: ctx.column,
      });
      ctx.pos++;
      ctx.column++;
      continue;
    }

    // Identifier
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      const startLine = ctx.line;
      const startCol = ctx.column;
      let ident = "";
      while (ctx.pos < ctx.source.length) {
        const c = ctx.source[ctx.pos];
        if (
          !c ||
          !(
            (c >= "a" && c <= "z") ||
            (c >= "A" && c <= "Z") ||
            (c >= "0" && c <= "9") ||
            c === "_"
          )
        )
          break;
        ident += c;
        ctx.pos++;
        ctx.column++;
      }
      tokens.push({
        type: "IDENTIFIER",
        value: ident,
        line: startLine,
        column: startCol,
      });
      continue;
    }

    // Unknown character
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

function parseExpression(ctx: ParseContext): Result<Expression, CompileError> {
  const token = peek(ctx);

  if (!token) {
    return {
      isOk: false,
      error: {
        message: "Unexpected end of input",
        reason: "Expected an expression.",
        suggestedFix: "Add a valid expression.",
        line: 0,
        column: 0,
      },
    };
  }

  if (token.type === "NUMBER") {
    consume(ctx);
    return {
      isOk: true,
      value: {
        type: "NumberLiteral",
        value: parseInt(token.value, 10),
      },
    };
  }

  if (token.type === "IDENTIFIER") {
    consume(ctx);
    return {
      isOk: true,
      value: {
        type: "Identifier",
        name: token.value,
      },
    };
  }

  return {
    isOk: false,
    error: {
      message: `Unexpected token: '${token.value}'`,
      reason: "Expected a number or identifier.",
      suggestedFix: "Use a supported expression.",
      line: token.line,
      column: token.column,
    },
  };
}

function parseStatement(ctx: ParseContext): Result<Statement, CompileError> {
  const token = peek(ctx);

  if (!token) {
    return {
      isOk: false,
      error: {
        message: "Unexpected end of input",
        reason: "Expected a statement.",
        suggestedFix: "Add a valid expression.",
        line: 0,
        column: 0,
      },
    };
  }

  // let x = expr;
  if (token.type === "IDENTIFIER" && token.value === "let") {
    consume(ctx);

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

    const equalsToken = peek(ctx);
    if (!equalsToken || equalsToken.type !== "EQUALS") {
      return {
        isOk: false,
        error: {
          message: equalsToken
            ? `Expected '=' after variable name, got '${equalsToken.value}'`
            : "Expected '=' after variable name",
          reason: "Let declarations require an initializer.",
          suggestedFix: "Use 'let <name> = <expression>;'.",
          line: equalsToken?.line ?? 0,
          column: equalsToken?.column ?? 0,
        },
      };
    }
    consume(ctx);

    const exprResult = parseExpression(ctx);
    if (!exprResult.isOk) return exprResult;

    const semiToken = peek(ctx);
    if (!semiToken || semiToken.type !== "SEMICOLON") {
      return {
        isOk: false,
        error: {
          message: semiToken
            ? `Expected ';' after let declaration, got '${semiToken.value}'`
            : "Expected ';' after let declaration",
          reason: "Let declarations must end with a semicolon.",
          suggestedFix: "Add ';' at the end of the let declaration.",
          line: semiToken?.line ?? 0,
          column: semiToken?.column ?? 0,
        },
      };
    }
    consume(ctx);

    return {
      isOk: true,
      value: {
        type: "LetDeclaration",
        name: nameToken.value,
        value: exprResult.value,
        line: token.line,
        column: token.column,
      },
    };
  }

  // Bare expression (number or identifier)
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
