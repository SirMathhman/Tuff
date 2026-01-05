import {
  DiagnosticReporter,
  DiagnosticSeverity,
} from "../common/diagnostics.js";
import { Span } from "../common/span.js";
import { Token, TokenType } from "../lexer/token.js";

export class ParserState {
  readonly tokens: Token[];
  current = 0;
  readonly reporter: DiagnosticReporter;
  readonly sourceFile: string;

  constructor(
    tokens: Token[],
    sourceFile: string,
    reporter: DiagnosticReporter
  ) {
    this.tokens = tokens;
    this.sourceFile = sourceFile;
    this.reporter = reporter;
  }

  match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw this.error(this.peek(), message);
  }

  check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  peek(): Token {
    return this.tokens[this.current];
  }

  previous(): Token {
    return this.tokens[this.current - 1];
  }

  error(token: Token, message: string): Error {
    this.reporter.report({
      severity: DiagnosticSeverity.Error,
      message,
      span: this.tokenSpan(token),
    });
    return new Error(message);
  }

  synchronize() {
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

  tokenSpan(token: Token): Span {
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

  span(start: Token, end: Token): Span {
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
