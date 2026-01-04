import { Token, TokenType } from "./token.js";
import {
  DiagnosticReporter,
  DiagnosticSeverity,
} from "../common/diagnostics.js";

export class Lexer {
  private source: string;
  private sourceFile: string;
  private tokens: Token[] = [];
  private start = 0;
  private current = 0;
  private line = 1;
  private column = 1;
  private reporter: DiagnosticReporter;

  private static keywords: Record<string, TokenType> = {
    from: TokenType.From,
    use: TokenType.Use,
    fn: TokenType.Fn,
    let: TokenType.Let,
    mut: TokenType.Mut,
    yield: TokenType.Yield,
    if: TokenType.If,
    else: TokenType.Else,
    while: TokenType.While,
    struct: TokenType.Struct,
    impl: TokenType.Impl,
    type: TokenType.Type,
    is: TokenType.Is,
    extern: TokenType.Extern,
    intrinsic: TokenType.Intrinsic,
    out: TokenType.Out,
  };

  constructor(
    source: string,
    sourceFile: string,
    reporter: DiagnosticReporter
  ) {
    this.source = source;
    this.sourceFile = sourceFile;
    this.reporter = reporter;
  }

  scanTokens(): Token[] {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.scanToken();
    }

    this.tokens.push({
      type: TokenType.EOF,
      lexeme: "",
      line: this.line,
      column: this.column,
      offset: this.current,
      length: 0,
    });
    return this.tokens;
  }

  private scanToken() {
    const c = this.advance();
    if (this.handlePunctuation(c)) return;
    if (this.handleArithmetic(c)) return;
    if (this.handleComparison(c)) return;

    switch (c) {
      case " ":
      case "\r":
      case "\t":
        break;
      case "\n":
        this.line++;
        this.column = 1;
        break;
      case '"':
        this.string();
        break;
      default:
        if (this.isDigit(c)) {
          this.number();
        } else if (this.isAlpha(c)) {
          this.identifier();
        } else {
          this.error(`Unexpected character: ${c}`);
        }
        break;
    }
  }

  private handlePunctuation(c: string): boolean {
    switch (c) {
      case "(":
        this.addToken(TokenType.OpenParen);
        return true;
      case ")":
        this.addToken(TokenType.CloseParen);
        return true;
      case "{":
        this.addToken(TokenType.OpenBrace);
        return true;
      case "}":
        this.addToken(TokenType.CloseBrace);
        return true;
      case "[":
        this.addToken(TokenType.OpenBracket);
        return true;
      case "]":
        this.addToken(TokenType.CloseBracket);
        return true;
      case ",":
        this.addToken(TokenType.Comma);
        return true;
      case ".":
        this.addToken(this.match(".") ? TokenType.DotDot : TokenType.Dot);
        return true;
      case ";":
        this.addToken(TokenType.Semicolon);
        return true;
      case ":":
        this.addToken(
          this.match(":") ? TokenType.DoubleColon : TokenType.Colon
        );
        return true;
      default:
        return false;
    }
  }

  private handleArithmetic(c: string): boolean {
    switch (c) {
      case "+":
        this.addToken(this.match("=") ? TokenType.PlusEqual : TokenType.Plus);
        return true;
      case "-":
        this.addToken(this.match("=") ? TokenType.MinusEqual : TokenType.Minus);
        return true;
      case "*":
        this.addToken(this.match("=") ? TokenType.StarEqual : TokenType.Star);
        return true;
      case "/":
        this.handleSlash();
        return true;
      case "%":
        this.addToken(TokenType.Percent);
        return true;
      default:
        return false;
    }
  }

  private handleComparison(c: string): boolean {
    switch (c) {
      case "!":
        this.addToken(this.match("=") ? TokenType.BangEqual : TokenType.Bang);
        return true;
      case "=":
        this.handleEqual();
        return true;
      case "<":
        this.handleLess();
        return true;
      case ">":
        this.handleGreater();
        return true;
      case "&":
        this.addToken(
          this.match("&") ? TokenType.AmpersandAmpersand : TokenType.Ampersand
        );
        return true;
      case "|":
        this.addToken(this.match("|") ? TokenType.PipePipe : TokenType.Pipe);
        return true;
      case "^":
        this.addToken(TokenType.Caret);
        return true;
      default:
        return false;
    }
  }

  private handleSlash() {
    if (this.match("/")) {
      while (this.peek() !== "\n" && !this.isAtEnd()) this.advance();
    } else if (this.match("*")) {
      this.multiLineComment();
    } else {
      this.addToken(this.match("=") ? TokenType.SlashEqual : TokenType.Slash);
    }
  }

  private handleEqual() {
    if (this.match(">")) {
      this.addToken(TokenType.Arrow);
    } else if (this.match("=")) {
      this.addToken(TokenType.EqualEqual);
    } else {
      this.addToken(TokenType.Equal);
    }
  }

  private handleLess() {
    if (this.match("<")) {
      this.addToken(TokenType.LessLess);
    } else if (this.match("=")) {
      this.addToken(TokenType.LessEqual);
    } else {
      this.addToken(TokenType.Less);
    }
  }

  private handleGreater() {
    if (this.match(">")) {
      this.addToken(TokenType.GreaterGreater);
    } else if (this.match("=")) {
      this.addToken(TokenType.GreaterEqual);
    } else {
      this.addToken(TokenType.Greater);
    }
  }

  private multiLineComment() {
    this.consumeUntil(() => this.peek() === "*" && this.peekNext() === "/");

    if (this.isAtEnd()) {
      this.error("Unterminated multi-line comment.");
      return;
    }

    // Consume "*/"
    this.advance();
    this.advance();
  }

  private identifier() {
    while (this.isAlphaNumeric(this.peek())) this.advance();

    const text = this.source.substring(this.start, this.current);
    let type = Lexer.keywords[text];
    if (type === undefined) type = TokenType.Identifier;
    this.addToken(type);
  }

  private number() {
    while (this.isDigit(this.peek())) this.advance();

    // Look for a fractional part.
    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      // Consume the "."
      this.advance();

      while (this.isDigit(this.peek())) this.advance();
    }

    this.addToken(
      TokenType.Number,
      parseFloat(
        this.source.substring(this.start, this.current).replace(/_/g, "")
      )
    );
  }

  private string() {
    this.consumeUntil(() => this.peek() === '"');

    if (this.isAtEnd()) {
      this.error("Unterminated string.");
      return;
    }

    // The closing ".
    this.advance();

    // Trim the surrounding quotes.
    const value = this.source.substring(this.start + 1, this.current - 1);
    this.addToken(TokenType.String, value);
  }

  private consumeUntil(predicate: () => boolean) {
    while (!predicate() && !this.isAtEnd()) {
      if (this.peek() === "\n") {
        this.line++;
        this.column = 1;
      }
      this.advance();
    }
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.source.charAt(this.current) !== expected) return false;

    this.current++;
    return true;
  }

  private peek(): string {
    if (this.isAtEnd()) return "\0";
    return this.source.charAt(this.current);
  }

  private peekNext(): string {
    if (this.current + 1 >= this.source.length) return "\0";
    return this.source.charAt(this.current + 1);
  }

  private isAlpha(c: string): boolean {
    return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c);
  }

  private isDigit(c: string): boolean {
    return (c >= "0" && c <= "9") || c === "_";
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private advance(): string {
    const c = this.source.charAt(this.current++);
    this.column++;
    return c;
  }

  private addToken(type: TokenType, literal?: any) {
    const text = this.source.substring(this.start, this.current);
    this.tokens.push({
      type,
      lexeme: text,
      literal,
      line: this.line,
      column: this.column - text.length,
      offset: this.start,
      length: this.current - this.start,
    });
  }

  private error(message: string) {
    this.reporter.report({
      severity: DiagnosticSeverity.Error,
      message,
      span: {
        start: { line: this.line, column: this.column, offset: this.current },
        end: { line: this.line, column: this.column, offset: this.current },
        sourceFile: this.sourceFile,
      },
    });
  }
}
