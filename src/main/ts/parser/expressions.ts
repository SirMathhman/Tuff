import { BlockExpr, Expression, Statement, TypeNode } from "../ast/ast.js";
import { Token, TokenType } from "../lexer/token.js";
import { ParserState } from "./state.js";

enum Precedence {
  None,
  Assignment, // =
  Or, // ||
  And, // &&
  Equality, // == !=
  Comparison, // < > <= >= is
  Term, // + -
  Factor, // * / %
  Unary, // ! -
  Call, // . () []
  Primary,
}

const BINARY_OPERATORS = new Set<TokenType>([
  TokenType.Plus,
  TokenType.Minus,
  TokenType.Star,
  TokenType.Slash,
  TokenType.Percent,
  TokenType.EqualEqual,
  TokenType.BangEqual,
  TokenType.Less,
  TokenType.LessEqual,
  TokenType.Greater,
  TokenType.GreaterEqual,
  TokenType.AmpersandAmpersand,
  TokenType.PipePipe,
]);

const PRECEDENCE: Partial<Record<TokenType, Precedence>> = {
  [TokenType.Equal]: Precedence.Assignment,
  [TokenType.PipePipe]: Precedence.Or,
  [TokenType.AmpersandAmpersand]: Precedence.And,
  [TokenType.EqualEqual]: Precedence.Equality,
  [TokenType.BangEqual]: Precedence.Equality,
  [TokenType.Less]: Precedence.Comparison,
  [TokenType.LessEqual]: Precedence.Comparison,
  [TokenType.Greater]: Precedence.Comparison,
  [TokenType.GreaterEqual]: Precedence.Comparison,
  [TokenType.Is]: Precedence.Comparison,
  [TokenType.Plus]: Precedence.Term,
  [TokenType.Minus]: Precedence.Term,
  [TokenType.Star]: Precedence.Factor,
  [TokenType.Slash]: Precedence.Factor,
  [TokenType.Percent]: Precedence.Factor,
  [TokenType.Dot]: Precedence.Call,
  [TokenType.OpenParen]: Precedence.Call,
  [TokenType.OpenBracket]: Precedence.Call,
};

export class ExpressionParser {
  constructor(
    private readonly state: ParserState,
    private readonly parseDeclaration: (
      requireSemicolon: boolean
    ) => Statement | null,
    private readonly parseType: () => TypeNode
  ) {}

  parseExpression(precedence: Precedence = Precedence.None): Expression {
    let left = this.prefix();

    while (precedence < this.getPrecedence(this.state.peek().type)) {
      left = this.infix(left);
    }

    return left;
  }

  parseBlockExpr(openBrace: Token): BlockExpr {
    const statements: Statement[] = [];

    while (!this.state.check(TokenType.CloseBrace) && !this.state.isAtEnd()) {
      const stmt = this.parseDeclaration(false);
      if (stmt) {
        statements.push(stmt);
        if (
          stmt.kind === "ExpressionStmt" &&
          this.state.previous().type !== TokenType.Semicolon &&
          !this.state.check(TokenType.CloseBrace)
        ) {
          throw this.state.error(
            this.state.peek(),
            "Expect ';' after expression."
          );
        }
      }
    }

    const endToken = this.state.consume(
      TokenType.CloseBrace,
      "Expect '}' after block."
    );

    return {
      kind: "BlockExpr",
      statements,
      span: this.state.span(openBrace, endToken),
    } as unknown as BlockExpr;
  }

  private prefix(): Expression {
    const token = this.state.advance();

    switch (token.type) {
      case TokenType.Number:
        return {
          kind: "LiteralExpr",
          value: token.literal,
          token,
          span: this.state.tokenSpan(token),
        } as unknown as Expression;
      case TokenType.String:
        return {
          kind: "LiteralExpr",
          value: token.literal,
          token,
          span: this.state.tokenSpan(token),
        } as unknown as Expression;
      case TokenType.Identifier:
        if (this.state.check(TokenType.OpenBrace)) {
          return this.structLiteral(token);
        }
        return {
          kind: "IdentifierExpr",
          name: token.lexeme,
          token,
          span: this.state.tokenSpan(token),
        } as unknown as Expression;
      case TokenType.OpenBrace:
        return this.parseBlockExpr(token);
      case TokenType.Minus:
      case TokenType.Bang:
        return this.unary(token);
      case TokenType.OpenParen:
        return this.grouping();
      case TokenType.OpenBracket:
        return this.arrayLiteral(token);
      case TokenType.If:
        return this.ifExpression(token);
      case TokenType.While:
        return this.whileExpression(token);
      default:
        throw this.state.error(token, "Expect expression.");
    }
  }

  private infix(left: Expression): Expression {
    const token = this.state.advance();

    if (BINARY_OPERATORS.has(token.type)) {
      return this.binary(left, token);
    }

    if (token.type === TokenType.OpenParen) return this.call(left, token);
    if (token.type === TokenType.Dot) return this.access(left);
    if (token.type === TokenType.OpenBracket) return this.indexOrSlice(left);
    if (token.type === TokenType.Is) return this.is(left);
    if (token.type === TokenType.Equal) return this.assignment(left);

    return left;
  }

  private unary(operator: Token): Expression {
    const right = this.parseExpression(Precedence.Unary);
    return {
      kind: "UnaryExpr",
      operator,
      right,
      span: this.state.span(operator, this.state.previous()),
    } as unknown as Expression;
  }

  private binary(left: Expression, operator: Token): Expression {
    const precedence = this.getPrecedence(operator.type);
    const right = this.parseExpression(precedence);
    return {
      kind: "BinaryExpr",
      left,
      operator,
      right,
      span: {
        start: left.span.start,
        end: right.span.end,
        sourceFile: this.state.sourceFile,
      },
    } as unknown as Expression;
  }

  private grouping(): Expression {
    const expr = this.parseExpression();
    this.state.consume(TokenType.CloseParen, "Expect ')' after expression.");
    return expr;
  }

  private call(callee: Expression, openParen: Token): Expression {
    const args: Expression[] = [];
    if (!this.state.check(TokenType.CloseParen)) {
      do {
        args.push(this.parseExpression());
      } while (this.state.match(TokenType.Comma));
    }
    const endToken = this.state.consume(
      TokenType.CloseParen,
      "Expect ')' after arguments."
    );
    return {
      kind: "CallExpr",
      callee,
      args,
      span: this.state.span(openParen, endToken),
    } as unknown as Expression;
  }

  private access(object: Expression): Expression {
    const member = this.state.consume(
      TokenType.Identifier,
      "Expect member name after '.'."
    ).lexeme;

    return {
      kind: "AccessExpr",
      object,
      member,
      span: {
        start: object.span.start,
        end: this.state.tokenSpan(this.state.previous()).end,
        sourceFile: this.state.sourceFile,
      },
    } as unknown as Expression;
  }

  private indexOrSlice(object: Expression): Expression {
    const startExpr = this.parseExpression();
    if (this.state.match(TokenType.DotDot)) {
      const endExpr = this.parseExpression();
      const endToken = this.state.consume(
        TokenType.CloseBracket,
        "Expect ']' after slice."
      );
      return {
        kind: "SliceExpr",
        object,
        start: startExpr,
        end: endExpr,
        span: {
          start: object.span.start,
          end: this.state.tokenSpan(endToken).end,
          sourceFile: this.state.sourceFile,
        },
      } as unknown as Expression;
    }

    const endToken = this.state.consume(
      TokenType.CloseBracket,
      "Expect ']' after index."
    );

    return {
      kind: "IndexExpr",
      object,
      index: startExpr,
      span: {
        start: object.span.start,
        end: this.state.tokenSpan(endToken).end,
        sourceFile: this.state.sourceFile,
      },
    } as unknown as Expression;
  }

  private is(expression: Expression): Expression {
    const type = this.parseType();
    return {
      kind: "IsExpr",
      expression,
      type,
      span: {
        start: expression.span.start,
        end: type.span.end,
        sourceFile: this.state.sourceFile,
      },
    } as unknown as Expression;
  }

  private assignment(left: Expression): Expression {
    const value = this.parseExpression(Precedence.Assignment - 1);
    return {
      kind: "BinaryExpr", // assignment modeled as binary
      left,
      operator: this.state.previous(),
      right: value,
      span: {
        start: left.span.start,
        end: value.span.end,
        sourceFile: this.state.sourceFile,
      },
    } as unknown as Expression;
  }

  private arrayLiteral(openBracket: Token): Expression {
    const elements: Expression[] = [];
    if (!this.state.check(TokenType.CloseBracket)) {
      do {
        elements.push(this.parseExpression());
      } while (this.state.match(TokenType.Comma));
    }
    const endToken = this.state.consume(
      TokenType.CloseBracket,
      "Expect ']' after array literal."
    );
    return {
      kind: "ArrayLiteralExpr",
      elements,
      span: this.state.span(openBracket, endToken),
    } as unknown as Expression;
  }

  private structLiteral(name: Token): Expression {
    const openBrace = this.state.consume(
      TokenType.OpenBrace,
      "Expect '{' after struct name."
    );

    const fields: { name: string; value: Expression }[] = [];
    if (!this.state.check(TokenType.CloseBrace)) {
      do {
        const fieldToken = this.state.consume(
          TokenType.Identifier,
          "Expect field name."
        );
        const fieldName = fieldToken.lexeme;

        let value: Expression;
        if (this.state.match(TokenType.Colon)) {
          value = this.parseExpression();
        } else {
          // shorthand: Point { x } == Point { x: x }
          value = {
            kind: "IdentifierExpr",
            name: fieldName,
            token: fieldToken,
            span: this.state.tokenSpan(fieldToken),
          } as unknown as Expression;
        }

        fields.push({ name: fieldName, value });
      } while (this.state.match(TokenType.Comma));
    }

    const endToken = this.state.consume(
      TokenType.CloseBrace,
      "Expect '}' after struct fields."
    );

    return {
      kind: "StructLiteralExpr",
      name: name.lexeme,
      fields,
      span: this.state.span(openBrace, endToken),
    } as unknown as Expression;
  }

  private ifExpression(ifToken: Token): Expression {
    this.state.consume(TokenType.OpenParen, "Expect '(' after 'if'.");
    const condition = this.parseExpression();
    this.state.consume(TokenType.CloseParen, "Expect ')' after condition.");

    const openThen = this.state.consume(
      TokenType.OpenBrace,
      "Expect '{' after if condition."
    );
    const thenBranch = this.parseBlockExpr(openThen);

    let elseBranch: BlockExpr | undefined;
    if (this.state.match(TokenType.Else)) {
      if (this.state.match(TokenType.If)) {
        const nestedIf = this.ifExpression(this.state.previous());
        elseBranch = {
          kind: "BlockExpr",
          statements: [
            {
              kind: "ExpressionStmt",
              expression: nestedIf,
              span: nestedIf.span,
            },
          ],
          span: nestedIf.span,
        } as unknown as BlockExpr;
      } else {
        const openElse = this.state.consume(
          TokenType.OpenBrace,
          "Expect '{' after else."
        );
        elseBranch = this.parseBlockExpr(openElse);
      }
    }

    return {
      kind: "IfExpr",
      condition,
      thenBranch,
      elseBranch,
      span: this.state.span(ifToken, this.state.previous()),
    } as unknown as Expression;
  }

  private whileExpression(whileToken: Token): Expression {
    this.state.consume(TokenType.OpenParen, "Expect '(' after 'while'.");
    const condition = this.parseExpression();
    this.state.consume(TokenType.CloseParen, "Expect ')' after condition.");

    const openBody = this.state.consume(
      TokenType.OpenBrace,
      "Expect '{' after while condition."
    );
    const body = this.parseBlockExpr(openBody);

    return {
      kind: "WhileExpr",
      condition,
      body,
      span: this.state.span(whileToken, this.state.previous()),
    } as unknown as Expression;
  }

  private getPrecedence(type: TokenType): Precedence {
    return PRECEDENCE[type] ?? Precedence.None;
  }
}
