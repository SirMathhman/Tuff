/**
 * Parser for Tuff Language
 * Builds AST from token stream using recursive descent parsing
 */

import { TokenType } from "./lexer.js";
import * as AST from "./ast.js";

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(offset = 0) {
    const pos = this.pos + offset;
    if (pos >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1]; // Return EOF
    }
    return this.tokens[pos];
  }

  advance() {
    return this.tokens[this.pos++];
  }

  expect(type) {
    const token = this.peek();
    if (token.type !== type) {
      throw new Error(
        `Expected ${type}, got ${token.type} at ${token.line}:${token.column}`,
      );
    }
    return this.advance();
  }

  match(...types) {
    if (types.includes(this.peek().type)) {
      return this.advance();
    }
    return null;
  }

  parse() {
    const statements = [];
    while (this.peek().type !== TokenType.EOF) {
      statements.push(this.parseStatement());
    }
    return new AST.Program(statements);
  }

  parseStatement() {
    const token = this.peek();

    if (token.type === TokenType.FN) {
      return this.parseFunctionDecl();
    }

    if (token.type === TokenType.VAR) {
      return this.parseVarDecl();
    }

    if (token.type === TokenType.LET) {
      return this.parseLetDecl();
    }

    if (token.type === TokenType.STRUCT) {
      return this.parseStructDecl();
    }

    if (token.type === TokenType.RETURN) {
      return this.parseReturn();
    }

    if (token.type === TokenType.IF) {
      return this.parseIf();
    }

    if (token.type === TokenType.WHILE) {
      return this.parseWhile();
    }

    if (token.type === TokenType.FOR) {
      return this.parseForStmt();
    }

    if (token.type === TokenType.BREAK) {
      const breakToken = this.expect(TokenType.BREAK);
      this.consumeStatementEnd();
      return new AST.BreakStmt(breakToken.line, breakToken.column);
    }

    if (token.type === TokenType.CONTINUE) {
      const continueToken = this.expect(TokenType.CONTINUE);
      this.consumeStatementEnd();
      return new AST.ContinueStmt(continueToken.line, continueToken.column);
    }

    if (token.type === TokenType.LBRACE) {
      return this.parseBlock();
    }

    // Expression statement
    return this.parseExprStmt();
  }

  parseFunctionDecl() {
    const fnToken = this.expect(TokenType.FN);
    const nameToken = this.expect(TokenType.IDENTIFIER);
    const name = nameToken.value;

    this.expect(TokenType.LPAREN);
    const params = [];
    if (this.peek().type !== TokenType.RPAREN) {
      params.push(this.expect(TokenType.IDENTIFIER).value);
      while (this.match(TokenType.COMMA)) {
        params.push(this.expect(TokenType.IDENTIFIER).value);
      }
    }
    this.expect(TokenType.RPAREN);

    this.expect(TokenType.LBRACE);
    const body = [];
    while (
      this.peek().type !== TokenType.RBRACE &&
      this.peek().type !== TokenType.EOF
    ) {
      body.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE);

    return new AST.FunctionDecl(
      name,
      params,
      body,
      fnToken.line,
      fnToken.column,
    );
  }

  parseVarDecl() {
    const varToken = this.expect(TokenType.VAR);
    const nameToken = this.expect(TokenType.IDENTIFIER);
    const name = nameToken.value;

    let init = null;
    if (this.match(TokenType.ASSIGN)) {
      init = this.parseExpression();
    }

    this.consumeStatementEnd();
    return new AST.VarDecl(name, init, varToken.line, varToken.column);
  }

  parseLetDecl() {
    const letToken = this.expect(TokenType.LET);
    const mutable = this.match(TokenType.MUT) !== null;
    const nameToken = this.expect(TokenType.IDENTIFIER);
    const name = nameToken.value;

    let init = null;
    if (this.match(TokenType.ASSIGN)) {
      init = this.parseExpression();
    }

    this.consumeStatementEnd();
    return new AST.LetDecl(name, init, mutable, letToken.line, letToken.column);
  }

  parseStructDecl() {
    const structToken = this.expect(TokenType.STRUCT);
    const nameToken = this.expect(TokenType.IDENTIFIER);
    const name = nameToken.value;

    this.expect(TokenType.LBRACE);
    const fields = [];
    while (
      this.peek().type !== TokenType.RBRACE &&
      this.peek().type !== TokenType.EOF
    ) {
      const fieldToken = this.expect(TokenType.IDENTIFIER);
      fields.push(fieldToken.value);
      if (this.peek().type === TokenType.SEMICOLON) {
        this.advance();
      }
      if (this.peek().type !== TokenType.RBRACE) {
        // Optional comma or semicolon between fields
        if (this.peek().type === TokenType.COMMA) {
          this.advance();
        }
      }
    }
    this.expect(TokenType.RBRACE);

    return new AST.StructDecl(
      name,
      fields,
      structToken.line,
      structToken.column,
    );
  }

  parseForStmt() {
    const forToken = this.expect(TokenType.FOR);
    this.expect(TokenType.LPAREN);

    // Parse: let mut i in 0..10
    const letOrVar = this.peek();
    let mutable = false;
    if (this.match(TokenType.LET)) {
      mutable = this.match(TokenType.MUT) !== null;
    } else {
      throw new Error("For loop requires 'let' declaration");
    }

    const varToken = this.expect(TokenType.IDENTIFIER);
    const variable = varToken.value;

    this.expect(TokenType.IN);
    const range = this.parseRange();
    this.expect(TokenType.RPAREN);

    this.expect(TokenType.LBRACE);
    const body = [];
    while (
      this.peek().type !== TokenType.RBRACE &&
      this.peek().type !== TokenType.EOF
    ) {
      body.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE);

    return new AST.ForStmt(
      variable,
      range,
      body,
      mutable,
      forToken.line,
      forToken.column,
    );
  }

  parseRange() {
    const start = this.parseAdditive();

    if (this.match(TokenType.DOTDOT)) {
      const end = this.parseAdditive();
      return new AST.RangeExpr(start, end, start.line, start.column);
    }

    throw new Error("Expected range (..) in for loop");
  }

  parseReturn() {
    const returnToken = this.expect(TokenType.RETURN);
    let value = null;

    // Check if there's a value to return
    if (
      this.peek().type !== TokenType.SEMICOLON &&
      this.peek().type !== TokenType.RBRACE &&
      this.peek().type !== TokenType.EOF
    ) {
      value = this.parseExpression();
    }

    this.consumeStatementEnd();
    return new AST.Return(value, returnToken.line, returnToken.column);
  }

  parseIf() {
    const ifToken = this.expect(TokenType.IF);
    this.expect(TokenType.LPAREN);
    const test = this.parseExpression();
    this.expect(TokenType.RPAREN);

    this.expect(TokenType.LBRACE);
    const consequent = [];
    while (
      this.peek().type !== TokenType.RBRACE &&
      this.peek().type !== TokenType.EOF
    ) {
      consequent.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE);

    let alternate = null;
    if (this.match(TokenType.ELSE)) {
      this.expect(TokenType.LBRACE);
      alternate = [];
      while (
        this.peek().type !== TokenType.RBRACE &&
        this.peek().type !== TokenType.EOF
      ) {
        alternate.push(this.parseStatement());
      }
      this.expect(TokenType.RBRACE);
    }

    return new AST.If(
      test,
      consequent,
      alternate,
      ifToken.line,
      ifToken.column,
    );
  }

  parseWhile() {
    const whileToken = this.expect(TokenType.WHILE);
    this.expect(TokenType.LPAREN);
    const test = this.parseExpression();
    this.expect(TokenType.RPAREN);

    this.expect(TokenType.LBRACE);
    const body = [];
    while (
      this.peek().type !== TokenType.RBRACE &&
      this.peek().type !== TokenType.EOF
    ) {
      body.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE);

    return new AST.While(test, body, whileToken.line, whileToken.column);
  }

  parseBlock() {
    const token = this.expect(TokenType.LBRACE);
    const statements = [];
    while (
      this.peek().type !== TokenType.RBRACE &&
      this.peek().type !== TokenType.EOF
    ) {
      statements.push(this.parseStatement());
    }
    this.expect(TokenType.RBRACE);
    return new AST.Block(statements, token.line, token.column);
  }

  parseExprStmt() {
    const token = this.peek();
    const expr = this.parseExpression();
    this.consumeStatementEnd();
    return new AST.ExprStmt(expr, token.line, token.column);
  }

  consumeStatementEnd() {
    if (this.peek().type === TokenType.SEMICOLON) {
      this.advance();
    }
    // Optional semicolon at EOF, RBRACE, or end of line
  }

  parseExpression() {
    return this.parseAssignment();
  }

  parseAssignment() {
    let expr = this.parseLogicalOr();

    if (this.match(TokenType.ASSIGN)) {
      const value = this.parseAssignment();
      if (expr instanceof AST.Identifier) {
        return new AST.Assignment(expr, value, expr.line, expr.column);
      } else {
        throw new Error("Invalid assignment target");
      }
    }

    return expr;
  }

  parseLogicalOr() {
    let expr = this.parseLogicalAnd();

    while (this.match(TokenType.OR_OR)) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseLogicalAnd();
      expr = new AST.BinaryOp(expr, op, right, expr.line, expr.column);
    }

    return expr;
  }

  parseLogicalAnd() {
    let expr = this.parseBitwiseOr();

    while (this.match(TokenType.AND_AND)) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseBitwiseOr();
      expr = new AST.BinaryOp(expr, op, right, expr.line, expr.column);
    }

    return expr;
  }

  parseBitwiseOr() {
    let expr = this.parseBitwiseXor();

    while (this.match(TokenType.PIPE)) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseBitwiseXor();
      expr = new AST.BinaryOp(expr, op, right, expr.line, expr.column);
    }

    return expr;
  }

  parseBitwiseXor() {
    let expr = this.parseBitwiseAnd();

    while (this.match(TokenType.CARET)) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseBitwiseAnd();
      expr = new AST.BinaryOp(expr, op, right, expr.line, expr.column);
    }

    return expr;
  }

  parseBitwiseAnd() {
    let expr = this.parseEquality();

    while (this.match(TokenType.AMPERSAND)) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseEquality();
      expr = new AST.BinaryOp(expr, op, right, expr.line, expr.column);
    }

    return expr;
  }

  parseEquality() {
    let expr = this.parseRelational();

    while (this.match(TokenType.EQ, TokenType.NEQ)) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseRelational();
      expr = new AST.BinaryOp(expr, op, right, expr.line, expr.column);
    }

    return expr;
  }

  parseRelational() {
    let expr = this.parseShift();

    while (
      this.match(TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE)
    ) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseShift();
      expr = new AST.BinaryOp(expr, op, right, expr.line, expr.column);
    }

    return expr;
  }

  parseShift() {
    let expr = this.parseAdditive();

    while (this.match(TokenType.LSHIFT, TokenType.RSHIFT)) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseAdditive();
      expr = new AST.BinaryOp(expr, op, right, expr.line, expr.column);
    }

    return expr;
  }

  parseAdditive() {
    let expr = this.parseMultiplicative();

    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseMultiplicative();
      expr = new AST.BinaryOp(expr, op, right, expr.line, expr.column);
    }

    return expr;
  }

  parseMultiplicative() {
    let expr = this.parseUnary();

    while (this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT)) {
      const op = this.tokens[this.pos - 1].value;
      const right = this.parseUnary();
      expr = new AST.BinaryOp(expr, op, right, expr.line, expr.column);
    }

    return expr;
  }

  parseUnary() {
    const token = this.peek();

    // Prefix unary operators
    if (
      this.match(
        TokenType.BANG,
        TokenType.MINUS,
        TokenType.TILDE,
        TokenType.PLUS_PLUS,
        TokenType.MINUS_MINUS,
      )
    ) {
      const op = this.tokens[this.pos - 1].value;
      const operand = this.parseUnary();
      return new AST.UnaryOp(op, operand, true, token.line, token.column);
    }

    return this.parsePostfix();
  }

  parsePostfix() {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match(TokenType.LPAREN)) {
        // Function call
        const args = [];
        if (this.peek().type !== TokenType.RPAREN) {
          args.push(this.parseExpression());
          while (this.match(TokenType.COMMA)) {
            args.push(this.parseExpression());
          }
        }
        this.expect(TokenType.RPAREN);
        expr = new AST.Call(expr, args, expr.line, expr.column);
      } else if (this.match(TokenType.LBRACKET)) {
        // Index access
        const index = this.parseExpression();
        this.expect(TokenType.RBRACKET);
        expr = new AST.IndexAccess(expr, index, expr.line, expr.column);
      } else if (this.match(TokenType.DOT)) {
        // Member access
        const prop = this.expect(TokenType.IDENTIFIER).value;
        expr = new AST.MemberAccess(expr, prop, expr.line, expr.column);
      } else if (this.match(TokenType.LBRACE)) {
        // Struct instantiation (only valid after identifier)
        if (!(expr instanceof AST.Identifier)) {
          throw new Error("Struct instantiation only valid with identifier");
        }
        const fields = [];
        if (this.peek().type !== TokenType.RBRACE) {
          fields.push(this.parseExpression());
          while (this.match(TokenType.COMMA)) {
            if (this.peek().type === TokenType.RBRACE) break; // Allow trailing comma
            fields.push(this.parseExpression());
          }
        }
        this.expect(TokenType.RBRACE);
        expr = new AST.StructLiteral(expr.name, fields, expr.line, expr.column);
      } else if (this.match(TokenType.PLUS_PLUS, TokenType.MINUS_MINUS)) {
        // Postfix operators
        const op = this.tokens[this.pos - 1].value;
        expr = new AST.UnaryOp(op, expr, false, expr.line, expr.column);
      } else {
        break;
      }
    }

    return expr;
  }

  parsePrimary() {
    const token = this.peek();

    // Numbers
    if (token.type === TokenType.NUMBER) {
      this.advance();
      return new AST.Number(token.value, token.line, token.column);
    }

    // Strings
    if (token.type === TokenType.STRING) {
      this.advance();
      return new AST.String(token.value, token.line, token.column);
    }

    // Booleans
    if (token.type === TokenType.TRUE) {
      this.advance();
      return new AST.Boolean(true, token.line, token.column);
    }

    if (token.type === TokenType.FALSE) {
      this.advance();
      return new AST.Boolean(false, token.line, token.column);
    }

    // Nil
    if (token.type === TokenType.NIL) {
      this.advance();
      return new AST.Nil(token.line, token.column);
    }

    // Identifiers
    if (token.type === TokenType.IDENTIFIER) {
      this.advance();
      return new AST.Identifier(token.value, token.line, token.column);
    }

    // Arrays
    if (this.match(TokenType.LBRACKET)) {
      const elements = [];
      if (this.peek().type !== TokenType.RBRACKET) {
        elements.push(this.parseExpression());
        while (this.match(TokenType.COMMA)) {
          elements.push(this.parseExpression());
        }
      }
      this.expect(TokenType.RBRACKET);
      return new AST.Array(elements, token.line, token.column);
    }

    // Parenthesized expression
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN);
      return expr;
    }

    throw new Error(
      `Unexpected token: ${token.type} at ${token.line}:${token.column}`,
    );
  }
}

export { Parser };
