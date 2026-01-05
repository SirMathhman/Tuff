import {
  Expression,
  Field,
  FnDecl,
  ImplDecl,
  ImportDecl,
  LetDecl,
  Modifier,
  ModifierKind,
  Param,
  Program,
  Statement,
  StructDecl,
  TypeAliasDecl,
  TypeNode,
} from "../ast/ast.js";
import { DiagnosticReporter } from "../common/diagnostics.js";
import { Token, TokenType } from "../lexer/token.js";
import { ExpressionParser } from "./expressions.js";
import { ParserState } from "./state.js";
import { TypeParser } from "./types.js";

export class Parser {
  private readonly state: ParserState;
  private readonly typeParser: TypeParser;
  private readonly expressionParser: ExpressionParser;

  constructor(
    tokens: Token[],
    sourceFile: string,
    reporter: DiagnosticReporter
  ) {
    this.state = new ParserState(tokens, sourceFile, reporter);
    this.typeParser = new TypeParser(this.state, (kind, token) =>
      this.makeModifier(kind, token)
    );
    this.expressionParser = new ExpressionParser(
      this.state,
      (requireSemicolon) => this.declaration(requireSemicolon),
      () => this.parseType()
    );
  }

  parse(): Program {
    const statements: Statement[] = [];
    const startToken = this.state.peek();

    while (!this.state.isAtEnd()) {
      try {
        const stmt = this.declaration(false);
        if (stmt) {
          statements.push(stmt);
          // Allow omitting ';' only if the expression statement is the last thing (EOF).
          if (
            stmt.kind === "ExpressionStmt" &&
            this.state.previous().type !== TokenType.Semicolon &&
            !this.state.isAtEnd()
          ) {
            throw this.state.error(
              this.state.peek(),
              "Expect ';' after expression."
            );
          }
        }
      } catch (e) {
        this.state.synchronize();
      }
    }

    return {
      kind: "Program",
      statements,
      span: this.state.span(startToken, this.state.peek()),
    };
  }

  private declaration(requireSemicolon = true): Statement | null {
    const modifiers = this.parseModifiers();

    if (this.state.match(TokenType.From)) return this.importDeclaration();
    if (this.state.match(TokenType.Let)) return this.letDeclaration(modifiers);
    if (this.state.match(TokenType.Fn)) return this.fnDeclaration(modifiers);
    if (this.state.match(TokenType.Struct))
      return this.structDeclaration(modifiers);
    if (this.state.match(TokenType.Impl)) return this.implDeclaration();
    if (this.state.match(TokenType.Type))
      return this.typeAliasDeclaration(modifiers);

    return this.statement(requireSemicolon);
  }

  private parseModifiers(): Modifier[] {
    const modifiers: Modifier[] = [];
    while (true) {
      if (this.state.match(TokenType.Out)) {
        modifiers.push(this.makeModifier("out", this.state.previous()));
      } else if (this.state.match(TokenType.Mut)) {
        modifiers.push(this.makeModifier("mut", this.state.previous()));
      } else if (this.state.match(TokenType.Extern)) {
        modifiers.push(this.makeModifier("extern", this.state.previous()));
      } else if (this.state.match(TokenType.Intrinsic)) {
        modifiers.push(this.makeModifier("intrinsic", this.state.previous()));
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
      span: this.state.tokenSpan(token),
    };
  }

  private importDeclaration(): ImportDecl {
    const start = this.state.previous();
    const namespace: string[] = [];

    namespace.push(
      this.state.consume(TokenType.Identifier, "Expect namespace.").lexeme
    );
    while (this.state.match(TokenType.DoubleColon)) {
      namespace.push(
        this.state.consume(TokenType.Identifier, "Expect namespace part.")
          .lexeme
      );
    }

    this.state.consume(TokenType.Use, "Expect 'use' after namespace.");
    this.state.consume(
      TokenType.OpenBrace,
      "Expect '{' before import members."
    );

    const members: string[] = [];
    if (!this.state.check(TokenType.CloseBrace)) {
      do {
        members.push(
          this.state.consume(TokenType.Identifier, "Expect member name.").lexeme
        );
      } while (this.state.match(TokenType.Comma));
    }

    this.state.consume(
      TokenType.CloseBrace,
      "Expect '}' after import members."
    );
    this.state.consume(
      TokenType.Semicolon,
      "Expect ';' after import declaration."
    );

    return {
      kind: "ImportDecl",
      namespace,
      members,
      span: this.state.span(start, this.state.previous()),
    };
  }

  private letDeclaration(modifiers: Modifier[]): LetDecl {
    const start =
      modifiers.length > 0 ? modifiers[0].token : this.state.previous();
    const name = this.state.consume(
      TokenType.Identifier,
      "Expect variable name."
    ).lexeme;

    let type: TypeNode | undefined;
    if (this.state.match(TokenType.Colon)) {
      type = this.parseType();
    }

    this.state.consume(TokenType.Equal, "Expect '=' before initializer.");
    const initializer = this.expression();
    this.state.consume(
      TokenType.Semicolon,
      "Expect ';' after variable declaration."
    );

    return {
      kind: "LetDecl",
      modifiers,
      name,
      type,
      initializer,
      span: this.state.span(start, this.state.previous()),
    };
  }

  private fnDeclaration(modifiers: Modifier[]): FnDecl {
    const start =
      modifiers.length > 0 ? modifiers[0].token : this.state.previous();
    const name = this.state.consume(
      TokenType.Identifier,
      "Expect function name."
    ).lexeme;

    this.state.consume(TokenType.OpenParen, "Expect '(' after function name.");
    const params: Param[] = [];
    if (!this.state.check(TokenType.CloseParen)) {
      do {
        const pName = this.state.consume(
          TokenType.Identifier,
          "Expect parameter name."
        ).lexeme;
        this.state.consume(TokenType.Colon, "Expect ':' after parameter name.");
        const pType = this.parseType();
        params.push({ name: pName, type: pType });
      } while (this.state.match(TokenType.Comma));
    }
    this.state.consume(TokenType.CloseParen, "Expect ')' after parameters.");

    let returnType: TypeNode | undefined;
    if (this.state.match(TokenType.Colon)) {
      returnType = this.parseType();
    }

    let body: Expression | undefined;
    const isExtern = modifiers.some((m) => m.modifier === "extern");

    if (this.state.match(TokenType.Arrow)) {
      body = this.expression();
      if (body.kind !== "BlockExpr") {
        this.state.consume(
          TokenType.Semicolon,
          "Expect ';' after expression body."
        );
      }
    } else if (this.state.check(TokenType.OpenBrace)) {
      const open = this.state.consume(
        TokenType.OpenBrace,
        "Expect '{' before function body."
      );
      body = this.expressionParser.parseBlockExpr(open);
    } else if (isExtern) {
      this.state.consume(
        TokenType.Semicolon,
        "Expect ';' after extern function declaration."
      );
    } else {
      throw this.state.error(this.state.peek(), "Expect function body.");
    }

    return {
      kind: "FnDecl",
      modifiers,
      name,
      params,
      returnType,
      body,
      span: this.state.span(start, this.state.previous()),
    };
  }

  private structDeclaration(modifiers: Modifier[]): StructDecl {
    const start =
      modifiers.length > 0 ? modifiers[0].token : this.state.previous();
    const name = this.state.consume(
      TokenType.Identifier,
      "Expect struct name."
    ).lexeme;

    this.state.consume(TokenType.OpenBrace, "Expect '{' before struct fields.");
    const fields: Field[] = [];
    if (!this.state.check(TokenType.CloseBrace)) {
      do {
        const fName = this.state.consume(
          TokenType.Identifier,
          "Expect field name."
        ).lexeme;
        this.state.consume(TokenType.Colon, "Expect ':' after field name.");
        const fType = this.parseType();
        fields.push({ name: fName, type: fType });
      } while (this.state.match(TokenType.Comma));
    }
    this.state.consume(TokenType.CloseBrace, "Expect '}' after struct fields.");

    return {
      kind: "StructDecl",
      modifiers,
      name,
      fields,
      span: this.state.span(start, this.state.previous()),
    };
  }

  private implDeclaration(): ImplDecl {
    const start = this.state.previous();
    const target = this.state.consume(
      TokenType.Identifier,
      "Expect type name to implement."
    ).lexeme;

    this.state.consume(TokenType.OpenBrace, "Expect '{' before impl methods.");
    const methods: FnDecl[] = [];
    while (!this.state.check(TokenType.CloseBrace) && !this.state.isAtEnd()) {
      const modifiers = this.parseModifiers();
      this.state.consume(TokenType.Fn, "Expect 'fn' for method declaration.");
      methods.push(this.fnDeclaration(modifiers));
    }
    this.state.consume(TokenType.CloseBrace, "Expect '}' after impl methods.");

    return {
      kind: "ImplDecl",
      target,
      methods,
      span: this.state.span(start, this.state.previous()),
    };
  }

  private typeAliasDeclaration(modifiers: Modifier[]): TypeAliasDecl {
    const start =
      modifiers.length > 0 ? modifiers[0].token : this.state.previous();
    const name = this.state.consume(
      TokenType.Identifier,
      "Expect type name."
    ).lexeme;

    let type: TypeNode | undefined;
    const isExtern = modifiers.some((m) => m.modifier === "extern");

    if (this.state.match(TokenType.Equal)) {
      type = this.parseType();
      this.state.consume(TokenType.Semicolon, "Expect ';' after type alias.");
    } else if (isExtern) {
      this.state.consume(
        TokenType.Semicolon,
        "Expect ';' after extern type declaration."
      );
    } else {
      throw this.state.error(this.state.peek(), "Expect '=' after type name.");
    }

    return {
      kind: "TypeAliasDecl",
      modifiers,
      name,
      type,
      span: this.state.span(start, this.state.previous()),
    };
  }

  private statement(requireSemicolon: boolean): Statement {
    if (this.state.match(TokenType.Yield)) return this.yieldStatement();
    return this.expressionStatement(requireSemicolon);
  }

  private yieldStatement(): Statement {
    const start = this.state.previous();
    const expression = this.expression();
    this.state.consume(TokenType.Semicolon, "Expect ';' after yield.");
    return {
      kind: "YieldStmt",
      expression,
      span: this.state.span(start, this.state.previous()),
    };
  }

  private expressionStatement(requireSemicolon: boolean): Statement {
    const expression = this.expression();
    if (requireSemicolon) {
      this.state.consume(TokenType.Semicolon, "Expect ';' after expression.");
    } else {
      this.state.match(TokenType.Semicolon);
    }
    return {
      kind: "ExpressionStmt",
      expression,
      span: expression.span,
    };
  }

  private expression(): Expression {
    return this.expressionParser.parseExpression();
  }

  // --- Types ---

  private parseType(): TypeNode {
    return this.typeParser.parseType();
  }
}
