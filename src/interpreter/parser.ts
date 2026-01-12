/* eslint-disable max-lines, complexity, no-restricted-syntax, max-lines-per-function, no-constant-condition */
/**
 * Token-based Parser for Tuff Language.
 * Transforms token stream into AST.
 */

import type { Token, TokenKind } from "./lexer";
import type {
  ASTExpr,
  ASTStmt,
  ASTProgram,
  ASTParam,
  ASTTypeExpr,
  ASTStructField,
  ASTPattern,
  ASTMatchArm,
  ASTBlockExpr,
} from "./astTypes";

// ============================================================================
// Parser State
// ============================================================================

export class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private peek(offset: number = 0): Token {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1]; // Return EOF
    }
    return this.tokens[idx];
  }

  private current(): Token {
    return this.peek(0);
  }

  private isAtEnd(): boolean {
    return this.current().kind === "eof";
  }

  private check(kind: TokenKind): boolean {
    return this.current().kind === kind;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.pos++;
    return this.tokens[this.pos - 1];
  }

  private match(...kinds: TokenKind[]): boolean {
    for (const kind of kinds) {
      if (this.check(kind)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(kind: TokenKind, message: string): Token {
    if (this.check(kind)) return this.advance();
    throw this.error(message);
  }

  private error(message: string): Error {
    const token = this.current();
    return new Error(`Parse error at line ${token.line}, column ${token.column}: ${message}`);
  }

  // ==========================================================================
  // Program Parsing
  // ==========================================================================

  parseProgram(): ASTProgram {
    const statements: ASTStmt[] = [];
    while (!this.isAtEnd()) {
      statements.push(this.parseStatement());
    }
    return { kind: "program", statements };
  }

  // ==========================================================================
  // Statement Parsing
  // ==========================================================================

  parseStatement(): ASTStmt {
    if (this.check("let")) return this.parseLetStatement();
    if (this.check("fn")) return this.parseFnStatement();
    if (this.check("struct")) return this.parseStructStatement();
    if (this.check("type")) return this.parseTypeStatement();
    if (this.check("if")) return this.parseIfStatement();
    if (this.check("while")) return this.parseWhileStatement();
    if (this.check("for")) return this.parseForStatement();
    if (this.check("return")) return this.parseReturnStatement();
    if (this.check("yield")) return this.parseYieldStatement();
    if (this.check("break")) return this.parseBreakStatement();
    if (this.check("continue")) return this.parseContinueStatement();

    // Assignment or expression statement
    return this.parseExpressionOrAssignmentStatement();
  }

  private parseLetStatement(): ASTStmt {
    this.consume("let", "Expected 'let'");
    const mutable = this.match("mut");
    const name = this.consume("identifier", "Expected variable name").value;

    let typeAnnotation: ASTTypeExpr | null = null;
    if (this.match("colon")) {
      typeAnnotation = this.parseTypeExpression();
    }

    let initializer: ASTExpr | null = null;
    if (this.match("equals")) {
      initializer = this.parseExpression();
    }

    this.match("semicolon"); // Optional semicolon

    return {
      kind: "let-stmt",
      name,
      mutable,
      typeAnnotation,
      initializer,
    };
  }

  private parseFnStatement(): ASTStmt {
    this.consume("fn", "Expected 'fn'");
    const name = this.consume("identifier", "Expected function name").value;
    
    this.consume("lparen", "Expected '(' after function name");
    const params = this.parseParamList();
    this.consume("rparen", "Expected ')' after parameters");

    let returnType: ASTTypeExpr | null = null;
    if (this.match("colon")) {
      returnType = this.parseTypeExpression();
    }

    this.consume("arrow", "Expected '=>' before function body");
    
    // If body is a block, parse it directly; otherwise parse a simple expression
    let body: ASTExpr;
    if (this.check("lbrace")) {
      body = this.parseBlockExpression();
    } else {
      body = this.parseSingleExpressionBody();
    }

    // Consume optional trailing semicolon
    this.match("semicolon");

    return {
      kind: "fn-stmt",
      name,
      params,
      returnType,
      body,
    };
  }

  // Parse a single expression (for non-block fn bodies) - stops at ';'
  private parseSingleExpressionBody(): ASTExpr {
    // For simple bodies like `a + b`, we parse until we hit `;` or `}`
    // Use parseExpression but rely on the semicolon being consumed afterward
    return this.parseExpression();
  }

  private parseStructStatement(): ASTStmt {
    this.consume("struct", "Expected 'struct'");
    const name = this.consume("identifier", "Expected struct name").value;

    const genericParams: string[] = [];
    if (this.match("less")) {
      do {
        genericParams.push(this.consume("identifier", "Expected generic parameter").value);
      } while (this.match("comma"));
      this.consume("greater", "Expected '>' after generic parameters");
    }

    this.consume("lbrace", "Expected '{' after struct name");
    const fields = this.parseStructFields();
    this.consume("rbrace", "Expected '}' after struct fields");

    return {
      kind: "struct-stmt",
      name,
      genericParams,
      fields,
    };
  }

  private parseTypeStatement(): ASTStmt {
    this.consume("type", "Expected 'type'");
    const name = this.consume("identifier", "Expected type name").value;
    this.consume("equals", "Expected '=' after type name");

    const aliasOf = this.parseTypeExpression();

    let destructor: string | null = null;
    if (this.match("then")) {
      destructor = this.consume("identifier", "Expected destructor function name").value;
    }

    this.match("semicolon");

    return {
      kind: "type-stmt",
      name,
      aliasOf,
      destructor,
    };
  }

  private parseIfStatement(): ASTStmt {
    this.consume("if", "Expected 'if'");
    this.consume("lparen", "Expected '(' after 'if'");
    const condition = this.parseExpression();
    this.consume("rparen", "Expected ')' after condition");

    const thenBranch = this.check("lbrace")
      ? this.parseBlockExpression()
      : this.parseStatement();

    let elseBranch: ASTStmt | ASTBlockExpr | null = null;
    if (this.match("else")) {
      elseBranch = this.check("lbrace")
        ? this.parseBlockExpression()
        : this.parseStatement();
    }

    return {
      kind: "if-stmt",
      condition,
      thenBranch: thenBranch as ASTStmt | ASTBlockExpr,
      elseBranch,
    };
  }

  private parseWhileStatement(): ASTStmt {
    this.consume("while", "Expected 'while'");
    this.consume("lparen", "Expected '(' after 'while'");
    const condition = this.parseExpression();
    this.consume("rparen", "Expected ')' after condition");

    const body = this.check("lbrace")
      ? this.parseBlockExpression()
      : this.parseStatement();

    return {
      kind: "while-stmt",
      condition,
      body: body as ASTStmt | ASTBlockExpr,
    };
  }

  private parseForStatement(): ASTStmt {
    this.consume("for", "Expected 'for'");
    this.consume("lparen", "Expected '(' after 'for'");
    this.consume("let", "Expected 'let' in for loop");

    const mutable = this.match("mut");
    const varName = this.consume("identifier", "Expected loop variable name").value;

    this.consume("in", "Expected 'in' after loop variable");
    const start = this.parseExpression();
    this.consume("dotdot", "Expected '..' in range");
    const end = this.parseExpression();
    this.consume("rparen", "Expected ')' after range");

    const body = this.check("lbrace")
      ? this.parseBlockExpression()
      : this.parseStatement();

    return {
      kind: "for-stmt",
      varName,
      mutable,
      start,
      end,
      body: body as ASTStmt | ASTBlockExpr,
    };
  }

  private parseReturnStatement(): ASTStmt {
    this.consume("return", "Expected 'return'");
    let value: ASTExpr | null = null;
    if (!this.check("semicolon") && !this.check("rbrace") && !this.isAtEnd()) {
      value = this.parseExpression();
    }
    this.match("semicolon");
    return { kind: "return-stmt", value };
  }

  private parseYieldStatement(): ASTStmt {
    this.consume("yield", "Expected 'yield'");
    const value = this.parseExpression();
    this.match("semicolon");
    return { kind: "yield-stmt", value };
  }

  private parseBreakStatement(): ASTStmt {
    this.consume("break", "Expected 'break'");
    this.match("semicolon");
    return { kind: "break-stmt" };
  }

  private parseContinueStatement(): ASTStmt {
    this.consume("continue", "Expected 'continue'");
    this.match("semicolon");
    return { kind: "continue-stmt" };
  }

  private parseExpressionOrAssignmentStatement(): ASTStmt {
    const expr = this.parseExpression();

    // Check for assignment
    if (this.match("equals")) {
      const value = this.parseExpression();
      this.match("semicolon");
      return { kind: "assign-stmt", target: expr, value };
    }

    // Check for compound assignment
    if (this.match("pluseq", "minuseq", "stareq", "slasheq")) {
      const op = this.tokens[this.pos - 1].value;
      const value = this.parseExpression();
      this.match("semicolon");
      return { kind: "compound-assign-stmt", target: expr, op, value };
    }

    this.match("semicolon");
    return { kind: "expr-stmt", expr };
  }

  // ==========================================================================
  // Expression Parsing (Precedence Climbing)
  // ==========================================================================

  parseExpression(): ASTExpr {
    return this.parseOrExpression();
  }

  private parseOrExpression(): ASTExpr {
    let left = this.parseAndExpression();
    while (this.match("or")) {
      const right = this.parseAndExpression();
      left = { kind: "binary-op", op: "||", left, right };
    }
    return left;
  }

  private parseAndExpression(): ASTExpr {
    let left = this.parseComparisonExpression();
    while (this.match("and")) {
      const right = this.parseComparisonExpression();
      left = { kind: "binary-op", op: "&&", left, right };
    }
    return left;
  }

  private parseComparisonExpression(): ASTExpr {
    let left = this.parseAdditiveExpression();
    while (this.match("less", "greater", "leq", "geq", "eq", "neq")) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseAdditiveExpression();
      left = { kind: "binary-op", op, left, right };
    }
    return left;
  }

  private parseAdditiveExpression(): ASTExpr {
    let left = this.parseMultiplicativeExpression();
    while (this.match("plus", "minus")) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseMultiplicativeExpression();
      left = { kind: "binary-op", op, left, right };
    }
    return left;
  }

  private parseMultiplicativeExpression(): ASTExpr {
    let left = this.parseUnaryExpression();
    while (this.match("star", "slash")) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseUnaryExpression();
      left = { kind: "binary-op", op, left, right };
    }
    return left;
  }

  private parseUnaryExpression(): ASTExpr {
    if (this.match("bang")) {
      const operand = this.parseUnaryExpression();
      return { kind: "unary-not", operand };
    }
    if (this.match("minus")) {
      const operand = this.parseUnaryExpression();
      return { kind: "unary-minus", operand };
    }
    if (this.match("star")) {
      const operand = this.parseUnaryExpression();
      return { kind: "deref", operand };
    }
    if (this.match("ampersand")) {
      const mutable = this.match("mut");
      const operand = this.parseUnaryExpression();
      return { kind: "address-of", operand, mutable };
    }
    return this.parsePostfixExpression();
  }

  private parsePostfixExpression(): ASTExpr {
    let expr = this.parsePrimaryExpression();

    while (true) {
      if (this.match("dot")) {
        const field = this.consume("identifier", "Expected field name").value;
        if (this.check("lparen")) {
          // Method call
          this.advance();
          const args = this.parseArgList();
          this.consume("rparen", "Expected ')' after arguments");
          expr = { kind: "method-call", receiver: expr, method: field, args };
        } else {
          // Field access
          expr = { kind: "field-access", object: expr, field };
        }
      } else if (this.match("lbracket")) {
        const index = this.parseExpression();
        this.consume("rbracket", "Expected ']' after index");
        expr = { kind: "index", target: expr, index };
      } else if (this.match("lparen")) {
        const args = this.parseArgList();
        this.consume("rparen", "Expected ')' after arguments");
        expr = { kind: "call", func: expr, args };
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimaryExpression(): ASTExpr {
    // Boolean literals
    if (this.match("true")) {
      return { kind: "boolean", value: true };
    }
    if (this.match("false")) {
      return { kind: "boolean", value: false };
    }

    // Number literal
    if (this.check("number")) {
      const token = this.advance();
      const value = parseFloat(token.value);
      const suffix = token.value.replace(/^-?\d+/, "");
      return { kind: "number", value, suffix: suffix || undefined };
    }

    // This keyword
    if (this.match("this")) {
      if (this.match("dot")) {
        const field = this.consume("identifier", "Expected field name after 'this.'").value;
        return { kind: "this-field", field };
      }
      return { kind: "this" };
    }

    // Identifier
    if (this.check("identifier")) {
      const name = this.advance().value;
      return { kind: "identifier", name };
    }

    // Grouped expression
    if (this.match("lparen")) {
      // Check for lambda: (params) => body
      if (this.isLambdaStart()) {
        return this.parseLambda();
      }
      const expr = this.parseExpression();
      this.consume("rparen", "Expected ')' after expression");
      return expr;
    }

    // Block expression or struct literal
    if (this.check("lbrace")) {
      // Lookahead to distinguish: { expr, expr } vs { stmt; ... }
      if (this.isStructLiteralStart()) {
        return this.parseStructLiteral();
      }
      return this.parseBlockExpression();
    }

    // Array literal
    if (this.match("lbracket")) {
      const elements: ASTExpr[] = [];
      if (!this.check("rbracket")) {
        do {
          elements.push(this.parseExpression());
        } while (this.match("comma"));
      }
      this.consume("rbracket", "Expected ']' after array elements");
      return { kind: "array-literal", elements };
    }

    // If expression
    if (this.check("if")) {
      return this.parseIfExpression();
    }

    // Match expression
    if (this.check("match")) {
      return this.parseMatchExpression();
    }

    // fn expression (lambda)
    if (this.check("fn")) {
      return this.parseFnExpression();
    }

    throw this.error(`Unexpected token: ${this.current().kind}`);
  }

  private isLambdaStart(): boolean {
    // Look ahead to see if this is (params) => body
    // Save position
    const savedPos = this.pos;
    let depth = 1;
    
    // We're after the opening '('
    while (depth > 0 && !this.isAtEnd()) {
      if (this.check("lparen")) depth++;
      else if (this.check("rparen")) depth--;
      if (depth > 0) this.advance();
    }

    if (this.check("rparen")) {
      this.advance();
      const isLambda = this.check("arrow");
      this.pos = savedPos; // Restore position
      return isLambda;
    }

    this.pos = savedPos;
    return false;
  }

  private isStructLiteralStart(): boolean {
    // Look ahead: { expr, expr } is struct literal (commas)
    // { stmt; ... } is block (semicolons or statements)
    const savedPos = this.pos;
    this.advance(); // consume '{'
    
    // Empty braces could be either, treat as block
    if (this.check("rbrace")) {
      this.pos = savedPos;
      return false;
    }
    
    // Scan until we see ',' (struct), ';' (block), or '}' (single-expr)
    let depth = 1;
    while (depth > 0 && !this.isAtEnd()) {
      if (this.check("lbrace") || this.check("lparen") || this.check("lbracket")) depth++;
      else if (this.check("rbrace") || this.check("rparen") || this.check("rbracket")) depth--;
      
      if (depth === 1) {
        if (this.check("comma")) {
          this.pos = savedPos;
          return true; // Found comma at top-level: struct literal
        }
        if (this.check("semicolon")) {
          this.pos = savedPos;
          return false; // Found semicolon at top-level: block
        }
      }
      
      if (depth > 0) this.advance();
    }
    
    this.pos = savedPos;
    return false;
  }

  private parseStructLiteral(): ASTExpr {
    this.consume("lbrace", "Expected '{'");
    const fields: ASTExpr[] = [];
    
    if (!this.check("rbrace")) {
      do {
        fields.push(this.parseExpression());
      } while (this.match("comma"));
    }
    
    this.consume("rbrace", "Expected '}'");
    return { kind: "struct-literal", typeName: null, fields };
  }

  private parseLambda(): ASTExpr {
    // We're after the opening '('
    const params = this.parseParamList();
    this.consume("rparen", "Expected ')' after lambda parameters");
    this.consume("arrow", "Expected '=>' after lambda parameters");
    const body = this.parseExpression();
    return { kind: "lambda", params, returnType: null, body };
  }

  private parseBlockExpression(): ASTBlockExpr {
    this.consume("lbrace", "Expected '{'");
    const statements: ASTStmt[] = [];
    let finalExpr: ASTExpr | null = null;

    while (!this.check("rbrace") && !this.isAtEnd()) {
      // Try to parse as statement
      const stmt = this.parseStatement();
      
      // Check if this might be a trailing expression
      if (stmt.kind === "expr-stmt" && this.check("rbrace")) {
        finalExpr = stmt.expr;
      } else {
        statements.push(stmt);
      }
    }

    this.consume("rbrace", "Expected '}'");

    return { kind: "block-expr", statements, finalExpr };
  }

  private parseIfExpression(): ASTExpr {
    this.consume("if", "Expected 'if'");
    this.consume("lparen", "Expected '(' after 'if'");
    const condition = this.parseExpression();
    this.consume("rparen", "Expected ')' after condition");

    const thenBranch = this.parseExpression();

    let elseBranch: ASTExpr | null = null;
    if (this.match("else")) {
      elseBranch = this.parseExpression();
    }

    return {
      kind: "if-expr",
      condition,
      thenBranch,
      elseBranch,
    };
  }

  private parseMatchExpression(): ASTExpr {
    this.consume("match", "Expected 'match'");
    this.consume("lparen", "Expected '(' after 'match'");
    const subject = this.parseExpression();
    this.consume("rparen", "Expected ')' after match subject");

    this.consume("lbrace", "Expected '{' after match subject");
    const arms: ASTMatchArm[] = [];

    while (!this.check("rbrace") && !this.isAtEnd()) {
      arms.push(this.parseMatchArm());
    }

    this.consume("rbrace", "Expected '}' after match arms");

    return { kind: "match-expr", subject, arms };
  }

  private parseMatchArm(): ASTMatchArm {
    this.consume("case", "Expected 'case' in match arm");
    const pattern = this.parsePattern();
    this.consume("arrow", "Expected '=>' after pattern");
    const body = this.parseExpression();
    this.match("semicolon");
    return { pattern, body };
  }

  private parsePattern(): ASTPattern {
    if (this.match("underscore")) {
      return { kind: "pattern-wildcard" };
    }
    const value = this.parsePrimaryExpression();
    return { kind: "pattern-literal", value };
  }

  private parseFnExpression(): ASTExpr {
    this.consume("fn", "Expected 'fn'");
    
    // Optional name
    if (this.check("identifier") && this.peek(1).kind === "lparen") {
      this.advance(); // Skip the name for now
    }

    this.consume("lparen", "Expected '(' after 'fn'");
    const params = this.parseParamList();
    this.consume("rparen", "Expected ')' after parameters");

    let returnType: ASTTypeExpr | null = null;
    if (this.match("colon")) {
      returnType = this.parseTypeExpression();
    }

    this.consume("arrow", "Expected '=>' before function body");
    const body = this.parseExpression();

    return { kind: "lambda", params, returnType, body };
  }

  // ==========================================================================
  // Type Expression Parsing
  // ==========================================================================

  parseTypeExpression(): ASTTypeExpr {
    // Pointer type: *T or *mut T
    if (this.match("star")) {
      const mutable = this.match("mut");
      const pointee = this.parseTypeExpression();
      return { kind: "type-pointer", mutable, pointee };
    }

    // Array type: [T; init; length]
    if (this.match("lbracket")) {
      const elementType = this.parseTypeExpression();
      this.consume("semicolon", "Expected ';' in array type");
      const init = parseInt(this.consume("number", "Expected init count").value, 10);
      this.consume("semicolon", "Expected ';' in array type");
      const length = parseInt(this.consume("number", "Expected length").value, 10);
      this.consume("rbracket", "Expected ']' after array type");
      return { kind: "type-array", elementType, init, length };
    }

    // Function type: (T, T) => R
    if (this.match("lparen")) {
      const params: ASTTypeExpr[] = [];
      if (!this.check("rparen")) {
        do {
          params.push(this.parseTypeExpression());
        } while (this.match("comma"));
      }
      this.consume("rparen", "Expected ')' in function type");
      this.consume("arrow", "Expected '=>' in function type");
      const returnType = this.parseTypeExpression();
      return { kind: "type-function", params, returnType };
    }

    // Identifier or generic: T or T<A, B>
    const name = this.consume("identifier", "Expected type name").value;
    
    if (this.match("less")) {
      const typeArgs: ASTTypeExpr[] = [];
      do {
        typeArgs.push(this.parseTypeExpression());
      } while (this.match("comma"));
      this.consume("greater", "Expected '>' after type arguments");
      return { kind: "type-generic", baseName: name, typeArgs };
    }

    return { kind: "type-ident", name };
  }

  // ==========================================================================
  // Helper Parsing Methods
  // ==========================================================================

  private parseParamList(): ASTParam[] {
    const params: ASTParam[] = [];
    if (!this.check("rparen")) {
      do {
        const name = this.consume("identifier", "Expected parameter name").value;
        this.consume("colon", "Expected ':' after parameter name");
        const typeAnnotation = this.parseTypeExpression();
        params.push({ name, typeAnnotation });
      } while (this.match("comma"));
    }
    return params;
  }

  private parseStructFields(): ASTStructField[] {
    const fields: ASTStructField[] = [];
    while (!this.check("rbrace") && !this.isAtEnd()) {
      const name = this.consume("identifier", "Expected field name").value;
      this.consume("colon", "Expected ':' after field name");
      const typeAnnotation = this.parseTypeExpression();
      fields.push({ name, typeAnnotation });
      this.match("comma");
    }
    return fields;
  }

  private parseArgList(): ASTExpr[] {
    const args: ASTExpr[] = [];
    if (!this.check("rparen")) {
      do {
        args.push(this.parseExpression());
      } while (this.match("comma"));
    }
    return args;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export function parse(tokens: Token[]): ASTProgram {
  return new Parser(tokens).parseProgram();
}

export function parseExpression(tokens: Token[]): ASTExpr {
  return new Parser(tokens).parseExpression();
}
