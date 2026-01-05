import {
  Program,
  Statement,
  ImportDecl,
  LetDecl,
  FnDecl,
  StructDecl,
  ImplDecl,
  TypeAliasDecl,
  Modifier,
  ModifierKind,
  Expression,
  TypeNode,
  Param,
  Field,
  BlockExpr,
} from "../ast/ast.js";
import { Token, TokenType } from "../lexer/token.js";
import {
  DiagnosticReporter,
  DiagnosticSeverity,
} from "../common/diagnostics.js";
import { Span } from "../common/span.js";

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

export class Parser {
  private static readonly BINARY_OPERATORS = new Set<TokenType>([
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

  private static readonly PRECEDENCE: Partial<Record<TokenType, Precedence>> = {
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

  private tokens: Token[];
  private current = 0;
  private reporter: DiagnosticReporter;
  private sourceFile: string;

  constructor(
    tokens: Token[],
    sourceFile: string,
    reporter: DiagnosticReporter
  ) {
    this.tokens = tokens;
    this.sourceFile = sourceFile;
    this.reporter = reporter;
  }

  parse(): Program {
    const statements: Statement[] = [];
    const startToken = this.peek();

    while (!this.isAtEnd()) {
      try {
        const stmt = this.declaration(false);
        if (stmt) {
          statements.push(stmt);
          // Allow omitting ';' only if the expression statement is the last thing (EOF).
          if (
            stmt.kind === "ExpressionStmt" &&
            this.previous().type !== TokenType.Semicolon &&
            !this.isAtEnd()
          ) {
            throw this.error(this.peek(), "Expect ';' after expression.");
          }
        }
      } catch (e) {
        this.synchronize();
      }
    }

    return {
      kind: "Program",
      statements,
      span: this.span(startToken, this.peek()),
    };
  }

  private declaration(requireSemicolon = true): Statement | null {
    const modifiers = this.parseModifiers();

    if (this.match(TokenType.From)) return this.importDeclaration();
    if (this.match(TokenType.Let)) return this.letDeclaration(modifiers);
    if (this.match(TokenType.Fn)) return this.fnDeclaration(modifiers);
    if (this.match(TokenType.Struct)) return this.structDeclaration(modifiers);
    if (this.match(TokenType.Impl)) return this.implDeclaration();
    if (this.match(TokenType.Type)) return this.typeAliasDeclaration(modifiers);

    return this.statement(requireSemicolon);
  }

  private parseModifiers(): Modifier[] {
    const modifiers: Modifier[] = [];
    while (true) {
      if (this.match(TokenType.Out)) {
        modifiers.push(this.makeModifier("out", this.previous()));
      } else if (this.match(TokenType.Mut)) {
        modifiers.push(this.makeModifier("mut", this.previous()));
      } else if (this.match(TokenType.Extern)) {
        modifiers.push(this.makeModifier("extern", this.previous()));
      } else if (this.match(TokenType.Intrinsic)) {
        modifiers.push(this.makeModifier("intrinsic", this.previous()));
      } else {
        break;
      }
    }
    return modifiers;
  }

  private makeModifier(kind: ModifierKind, token: Token): Modifier {
    return {
      kind: "Modifier",
      modifier: kind,
      token,
      span: this.tokenSpan(token),
    };
  }

  private importDeclaration(): ImportDecl {
    const start = this.previous();
    const namespace: string[] = [];

    namespace.push(
      this.consume(TokenType.Identifier, "Expect namespace.").lexeme
    );
    while (this.match(TokenType.DoubleColon)) {
      namespace.push(
        this.consume(TokenType.Identifier, "Expect namespace part.").lexeme
      );
    }

    this.consume(TokenType.Use, "Expect 'use' after namespace.");
    this.consume(TokenType.OpenBrace, "Expect '{' before import members.");

    const members: string[] = [];
    if (!this.check(TokenType.CloseBrace)) {
      do {
        members.push(
          this.consume(TokenType.Identifier, "Expect member name.").lexeme
        );
      } while (this.match(TokenType.Comma));
    }

    this.consume(TokenType.CloseBrace, "Expect '}' after import members.");
    this.consume(TokenType.Semicolon, "Expect ';' after import declaration.");

    return {
      kind: "ImportDecl",
      namespace,
      members,
      span: this.span(start, this.previous()),
    };
  }

  private letDeclaration(modifiers: Modifier[]): LetDecl {
    const start = modifiers.length > 0 ? modifiers[0].token : this.previous();
    const name = this.consume(
      TokenType.Identifier,
      "Expect variable name."
    ).lexeme;

    let type: TypeNode | undefined;
    if (this.match(TokenType.Colon)) {
      type = this.parseType();
    }

    this.consume(TokenType.Equal, "Expect '=' before initializer.");
    const initializer = this.expression();
    this.consume(TokenType.Semicolon, "Expect ';' after variable declaration.");

    return {
      kind: "LetDecl",
      modifiers,
      name,
      type,
      initializer,
      span: this.span(start, this.previous()),
    };
  }

  private fnDeclaration(modifiers: Modifier[]): FnDecl {
    const start = modifiers.length > 0 ? modifiers[0].token : this.previous();
    const name = this.consume(
      TokenType.Identifier,
      "Expect function name."
    ).lexeme;

    this.consume(TokenType.OpenParen, "Expect '(' after function name.");
    const params: Param[] = [];
    if (!this.check(TokenType.CloseParen)) {
      do {
        const pName = this.consume(
          TokenType.Identifier,
          "Expect parameter name."
        ).lexeme;
        this.consume(TokenType.Colon, "Expect ':' after parameter name.");
        const pType = this.parseType();
        params.push({ name: pName, type: pType });
      } while (this.match(TokenType.Comma));
    }
    this.consume(TokenType.CloseParen, "Expect ')' after parameters.");

    let returnType: TypeNode | undefined;
    if (this.match(TokenType.Colon)) {
      returnType = this.parseType();
    }

    let body: Expression | undefined;
    const isExtern = modifiers.some((m) => m.modifier === "extern");

    if (this.match(TokenType.Arrow)) {
      body = this.expression();
      if (body.kind !== "BlockExpr") {
        this.consume(TokenType.Semicolon, "Expect ';' after expression body.");
      }
    } else if (this.check(TokenType.OpenBrace)) {
      body = this.block();
    } else if (isExtern) {
      this.consume(
        TokenType.Semicolon,
        "Expect ';' after extern function declaration."
      );
    } else {
      throw this.error(this.peek(), "Expect function body.");
    }

    return {
      kind: "FnDecl",
      modifiers,
      name,
      params,
      returnType,
      body,
      span: this.span(start, this.previous()),
    };
  }

  private structDeclaration(modifiers: Modifier[]): StructDecl {
    const start = modifiers.length > 0 ? modifiers[0].token : this.previous();
    const name = this.consume(
      TokenType.Identifier,
      "Expect struct name."
    ).lexeme;

    this.consume(TokenType.OpenBrace, "Expect '{' before struct fields.");
    const fields: Field[] = [];
    if (!this.check(TokenType.CloseBrace)) {
      do {
        const fName = this.consume(
          TokenType.Identifier,
          "Expect field name."
        ).lexeme;
        this.consume(TokenType.Colon, "Expect ':' after field name.");
        const fType = this.parseType();
        fields.push({ name: fName, type: fType });
      } while (this.match(TokenType.Comma));
    }
    this.consume(TokenType.CloseBrace, "Expect '}' after struct fields.");

    return {
      kind: "StructDecl",
      modifiers,
      name,
      fields,
      span: this.span(start, this.previous()),
    };
  }

  private implDeclaration(): ImplDecl {
    const start = this.previous();
    const target = this.consume(
      TokenType.Identifier,
      "Expect type name to implement."
    ).lexeme;

    this.consume(TokenType.OpenBrace, "Expect '{' before impl methods.");
    const methods: FnDecl[] = [];
    while (!this.check(TokenType.CloseBrace) && !this.isAtEnd()) {
      const modifiers = this.parseModifiers();
      this.consume(TokenType.Fn, "Expect 'fn' for method declaration.");
      methods.push(this.fnDeclaration(modifiers));
    }
    this.consume(TokenType.CloseBrace, "Expect '}' after impl methods.");

    return {
      kind: "ImplDecl",
      target,
      methods,
      span: this.span(start, this.previous()),
    };
  }

  private typeAliasDeclaration(modifiers: Modifier[]): TypeAliasDecl {
    const start = modifiers.length > 0 ? modifiers[0].token : this.previous();
    const name = this.consume(TokenType.Identifier, "Expect type name.").lexeme;

    let type: TypeNode | undefined;
    const isExtern = modifiers.some((m) => m.modifier === "extern");

    if (this.match(TokenType.Equal)) {
      type = this.parseType();
      this.consume(TokenType.Semicolon, "Expect ';' after type alias.");
    } else if (isExtern) {
      this.consume(
        TokenType.Semicolon,
        "Expect ';' after extern type declaration."
      );
    } else {
      throw this.error(this.peek(), "Expect '=' after type name.");
    }

    return {
      kind: "TypeAliasDecl",
      modifiers,
      name,
      type,
      span: this.span(start, this.previous()),
    };
  }

  private statement(requireSemicolon: boolean): Statement {
    if (this.match(TokenType.Yield)) return this.yieldStatement();
    return this.expressionStatement(requireSemicolon);
  }

  private yieldStatement(): Statement {
    const start = this.previous();
    const expression = this.expression();
    this.consume(TokenType.Semicolon, "Expect ';' after yield.");
    return {
      kind: "YieldStmt",
      expression,
      span: this.span(start, this.previous()),
    };
  }

  private expressionStatement(requireSemicolon: boolean): Statement {
    const expression = this.expression();
    if (requireSemicolon) {
      this.consume(TokenType.Semicolon, "Expect ';' after expression.");
    } else {
      this.match(TokenType.Semicolon);
    }
    return {
      kind: "ExpressionStmt",
      expression,
      span: expression.span,
    };
  }

  // --- Expressions ---

  private expression(precedence: Precedence = Precedence.None): Expression {
    let left = this.prefix();

    while (precedence < this.getPrecedence(this.peek().type)) {
      left = this.infix(left);
    }

    return left;
  }

  private prefix(): Expression {
    const token = this.advance();
    switch (token.type) {
      case TokenType.Number:
        return {
          kind: "LiteralExpr",
          value: token.literal,
          token,
          span: this.tokenSpan(token),
        } as unknown as Expression;
      case TokenType.String:
        return {
          kind: "LiteralExpr",
          value: token.literal,
          token,
          span: this.tokenSpan(token),
        } as unknown as Expression;
      case TokenType.Identifier: {
        const id = token;
        if (this.check(TokenType.OpenBrace)) {
          return this.structLiteral(id);
        }
        return {
          kind: "IdentifierExpr",
          name: id.lexeme,
          token: id,
          span: this.tokenSpan(id),
        } as unknown as Expression;
      }
      case TokenType.OpenBrace:
        return this.block();
      case TokenType.Minus:
      case TokenType.Bang:
        return this.unary(token);
      case TokenType.OpenParen:
        return this.grouping();
      case TokenType.OpenBracket:
        return this.arrayLiteral();
      case TokenType.If:
        return this.ifExpression();
      case TokenType.While:
        return this.whileExpression();
      default:
        throw this.error(token, "Expect expression.");
    }
  }

  private arrayLiteral(): Expression {
    const start = this.previous();
    const elements: Expression[] = [];
    if (!this.check(TokenType.CloseBracket)) {
      do {
        elements.push(this.expression());
      } while (this.match(TokenType.Comma));
    }
    const endToken = this.consume(
      TokenType.CloseBracket,
      "Expect ']' after array literal."
    );
    return {
      kind: "ArrayLiteralExpr",
      elements,
      span: this.span(start, endToken),
    } as unknown as Expression;
  }

  private ifExpression(): Expression {
    const start = this.previous();
    this.consume(TokenType.OpenParen, "Expect '(' after 'if'.");
    const condition = this.expression();
    this.consume(TokenType.CloseParen, "Expect ')' after condition.");

    this.consume(TokenType.OpenBrace, "Expect '{' after if condition.");
    const thenBranch = this.block() as unknown as BlockExpr;
    let elseBranch: BlockExpr | undefined;
    if (this.match(TokenType.Else)) {
      if (this.match(TokenType.If)) {
        // Handle else if
        const nestedIf = this.ifExpression();
        // Wrap nested if in a block to satisfy AST
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
        this.consume(TokenType.OpenBrace, "Expect '{' after else.");
        elseBranch = this.block() as unknown as BlockExpr;
      }
    }

    return {
      kind: "IfExpr",
      condition,
      thenBranch,
      elseBranch,
      span: this.span(start, this.previous()),
    } as unknown as Expression;
  }

  private whileExpression(): Expression {
    const start = this.previous();
    this.consume(TokenType.OpenParen, "Expect '(' after 'while'.");
    const condition = this.expression();
    this.consume(TokenType.CloseParen, "Expect ')' after condition.");

    this.consume(TokenType.OpenBrace, "Expect '{' after while condition.");
    const body = this.block() as unknown as BlockExpr;

    return {
      kind: "WhileExpr",
      condition,
      body,
      span: this.span(start, this.previous()),
    } as unknown as Expression;
  }

  private infix(left: Expression): Expression {
    const token = this.advance();

    if (Parser.BINARY_OPERATORS.has(token.type)) {
      return this.binary(left, token);
    }

    if (token.type === TokenType.OpenParen) return this.call(left);
    if (token.type === TokenType.Dot) return this.access(left);
    if (token.type === TokenType.OpenBracket) return this.indexOrSlice(left);
    if (token.type === TokenType.Is) return this.is(left);
    if (token.type === TokenType.Equal) return this.assignment(left);

    return left;
  }

  private unary(operator: Token): Expression {
    const right = this.expression(Precedence.Unary);
    return {
      kind: "UnaryExpr",
      operator,
      right,
      span: this.span(operator, this.previous()),
    } as unknown as Expression;
  }

  private binary(left: Expression, operator: Token): Expression {
    const precedence = this.getPrecedence(operator.type);
    const right = this.expression(precedence);
    return {
      kind: "BinaryExpr",
      left,
      operator,
      right,
      span: {
        start: left.span.start,
        end: right.span.end,
        sourceFile: this.sourceFile,
      },
    } as unknown as Expression;
  }

  private grouping(): Expression {
    const expr = this.expression();
    this.consume(TokenType.CloseParen, "Expect ')' after expression.");
    return expr;
  }

  private call(callee: Expression): Expression {
    const args: Expression[] = [];
    if (!this.check(TokenType.CloseParen)) {
      do {
        args.push(this.expression());
      } while (this.match(TokenType.Comma));
    }
    const endToken = this.consume(
      TokenType.CloseParen,
      "Expect ')' after arguments."
    );
    return {
      kind: "CallExpr",
      callee,
      args,
      span: {
        start: callee.span.start,
        end: this.tokenSpan(endToken).end,
        sourceFile: this.sourceFile,
      },
    } as unknown as Expression;
  }

  private access(object: Expression): Expression {
    const member = this.consume(
      TokenType.Identifier,
      "Expect member name after '.'."
    ).lexeme;
    return {
      kind: "AccessExpr",
      object,
      member,
      span: {
        start: object.span.start,
        end: this.tokenSpan(this.previous()).end,
        sourceFile: this.sourceFile,
      },
    } as unknown as Expression;
  }

  private indexOrSlice(object: Expression): Expression {
    const start = this.expression();
    if (this.match(TokenType.DotDot)) {
      const end = this.expression();
      const endToken = this.consume(
        TokenType.CloseBracket,
        "Expect ']' after slice."
      );
      return {
        kind: "SliceExpr",
        object,
        start,
        end,
        span: {
          start: object.span.start,
          end: this.tokenSpan(endToken).end,
          sourceFile: this.sourceFile,
        },
      } as unknown as Expression;
    }
    const endToken = this.consume(
      TokenType.CloseBracket,
      "Expect ']' after index."
    );
    return {
      kind: "IndexExpr",
      object,
      index: start,
      span: {
        start: object.span.start,
        end: this.tokenSpan(endToken).end,
        sourceFile: this.sourceFile,
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
        sourceFile: this.sourceFile,
      },
    } as unknown as Expression;
  }

  private structLiteral(name: Token): Expression {
    this.consume(TokenType.OpenBrace, "Expect '{' after struct name.");
    const fields: { name: string; value: Expression }[] = [];
    if (!this.check(TokenType.CloseBrace)) {
      do {
        const fName = this.consume(
          TokenType.Identifier,
          "Expect field name."
        ).lexeme;
        let value: Expression;
        if (this.match(TokenType.Colon)) {
          value = this.expression();
        } else {
          // Shorthand: Point { x } is same as Point { x: x }
          value = {
            kind: "IdentifierExpr",
            name: fName,
            token: this.previous(),
            span: this.tokenSpan(this.previous()),
          } as unknown as Expression;
        }
        fields.push({ name: fName, value });
      } while (this.match(TokenType.Comma));
    }
    const endToken = this.consume(
      TokenType.CloseBrace,
      "Expect '}' after struct fields."
    );
    return {
      kind: "StructLiteralExpr",
      name: name.lexeme,
      fields,
      span: this.span(name, endToken),
    } as unknown as Expression;
  }

  private assignment(left: Expression): Expression {
    const value = this.expression(Precedence.Assignment - 1);
    return {
      kind: "BinaryExpr", // Assignment is a binary expr in this AST
      left,
      operator: this.previous(),
      right: value,
      span: {
        start: left.span.start,
        end: value.span.end,
        sourceFile: this.sourceFile,
      },
    } as unknown as Expression;
  }

  private block(): Expression {
    const start = this.previous();
    const statements: Statement[] = [];
    while (!this.check(TokenType.CloseBrace) && !this.isAtEnd()) {
      const stmt = this.declaration(false);
      if (stmt) {
        statements.push(stmt);
        if (
          stmt.kind === "ExpressionStmt" &&
          this.previous().type !== TokenType.Semicolon
        ) {
          if (!this.check(TokenType.CloseBrace)) {
            throw this.error(this.peek(), "Expect ';' after expression.");
          }
        }
      }
    }
    const endToken = this.consume(
      TokenType.CloseBrace,
      "Expect '}' after block."
    );
    return {
      kind: "BlockExpr",
      statements,
      span: this.span(start, endToken),
    } as unknown as Expression;
  }

  private isDeclarationStart(): boolean {
    const type = this.peek().type;
    return (
      type === TokenType.Let ||
      type === TokenType.Fn ||
      type === TokenType.Struct ||
      type === TokenType.Impl ||
      type === TokenType.Type ||
      type === TokenType.From
    );
  }

  private getPrecedence(type: TokenType): Precedence {
    return Parser.PRECEDENCE[type] ?? Precedence.None;
  }

  // --- Types ---

  private parseType(): TypeNode {
    let type = this.parseBaseType();

    while (this.match(TokenType.Pipe)) {
      const right = this.parseBaseType();
      if (type.kind === "UnionType") {
        type.types.push(right);
        type.span = {
          start: type.span.start,
          end: right.span.end,
          sourceFile: this.sourceFile,
        };
      } else {
        type = {
          kind: "UnionType",
          types: [type, right],
          span: {
            start: type.span.start,
            end: right.span.end,
            sourceFile: this.sourceFile,
          },
        };
      }
    }

    return type;
  }

  private parseBaseType(): TypeNode {
    if (this.match(TokenType.OpenBracket)) {
      const start = this.previous();
      const elementType = this.parseType();
      this.consume(
        TokenType.Semicolon,
        "Expect ';' after element type in array."
      );
      const initialized = parseInt(
        this.consume(TokenType.Number, "Expect initialized count.").lexeme
      );
      this.consume(TokenType.Semicolon, "Expect ';' after initialized count.");
      const length = parseInt(
        this.consume(TokenType.Number, "Expect total length.").lexeme
      );
      const endToken = this.consume(
        TokenType.CloseBracket,
        "Expect ']' after array type."
      );
      return {
        kind: "ArrayType",
        elementType,
        initialized,
        length,
        span: this.span(start, endToken),
      };
    }

    if (this.match(TokenType.Star)) {
      const start = this.previous();
      const modifiers: Modifier[] = [];
      if (this.match(TokenType.Mut)) {
        modifiers.push(this.makeModifier("mut", this.previous()));
      }
      this.consume(TokenType.OpenBracket, "Expect '[' after slice pointer.");
      const elementType = this.parseType();
      const endToken = this.consume(
        TokenType.CloseBracket,
        "Expect ']' after slice type."
      );
      return {
        kind: "SliceType",
        elementType,
        modifiers,
        span: this.span(start, endToken),
      };
    }

    const token = this.consume(TokenType.Identifier, "Expect type name.");
    const primitives = [
      "I8",
      "I16",
      "I32",
      "I64",
      "U8",
      "U16",
      "U32",
      "U64",
      "ISize",
      "USize",
      "F32",
      "F64",
      "Bool",
      "Void",
      "NativeString",
    ];
    if (primitives.includes(token.lexeme)) {
      return {
        kind: "PrimitiveType",
        name: token.lexeme,
        span: this.tokenSpan(token),
      };
    }

    return {
      kind: "NamedType",
      name: token.lexeme,
      span: this.tokenSpan(token),
    };
  }

  // --- Helpers ---

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw this.error(this.peek(), message);
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private error(token: Token, message: string): Error {
    this.reporter.report({
      severity: DiagnosticSeverity.Error,
      message,
      span: this.tokenSpan(token),
    });
    return new Error(message);
  }

  private synchronize() {
    this.advance();

    while (!this.isAtEnd()) {
      if (this.previous().type === TokenType.Semicolon) return;

      switch (this.peek().type) {
        case TokenType.Fn:
        case TokenType.Let:
        case TokenType.Struct:
        case TokenType.Impl:
        case TokenType.Type:
        case TokenType.If:
        case TokenType.While:
        case TokenType.Yield:
        case TokenType.From:
          return;
      }

      this.advance();
    }
  }

  private tokenSpan(token: Token): Span {
    return {
      start: { line: token.line, column: token.column, offset: token.offset },
      end: {
        line: token.line,
        column: token.column + token.length,
        offset: token.offset + token.length,
      },
      sourceFile: this.sourceFile,
    };
  }

  private span(start: Token, end: Token): Span {
    return {
      start: { line: start.line, column: start.column, offset: start.offset },
      end: {
        line: end.line,
        column: end.column + end.length,
        offset: end.offset + end.length,
      },
      sourceFile: this.sourceFile,
    };
  }
}
