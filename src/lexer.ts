import type { Diagnostics } from "./diagnostics";
import { KEYWORDS, type Token, type TokenKind } from "./tokens";

export class Lexer {
  private i = 0;
  private line = 1;
  private col = 1;

  constructor(
    private readonly filePath: string,
    private readonly src: string,
    private readonly diags?: Diagnostics
  ) {}

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (!this.isEOF()) {
      const ch = this.peek();
      if (ch === " " || ch === "\t" || ch === "\r") {
        this.advance();
        continue;
      }
      if (ch === "\n") {
        tokens.push(this.makeToken("newline", "\n", this.i, this.i + 1));
        this.advance();
        this.line++;
        this.col = 1;
        continue;
      }
      if (ch === "/" && this.peek2() === "/") {
        this.readLineComment();
        continue;
      }
      if (ch === "/" && this.peek2() === "*") {
        const start = this.i;
        const line = this.line;
        const col = this.col;
        this.readBlockComment(start, line, col);
        continue;
      }

      const start = this.i;
      const line = this.line;
      const col = this.col;

      // punctuation
      switch (ch) {
        case "(":
          tokens.push(
            this.makeToken("lparen", "(", start, start + 1, line, col)
          );
          this.advance();
          continue;
        case ")":
          tokens.push(
            this.makeToken("rparen", ")", start, start + 1, line, col)
          );
          this.advance();
          continue;
        case "{":
          tokens.push(
            this.makeToken("lbrace", "{", start, start + 1, line, col)
          );
          this.advance();
          continue;
        case "}":
          tokens.push(
            this.makeToken("rbrace", "}", start, start + 1, line, col)
          );
          this.advance();
          continue;
        case "[":
          tokens.push(
            this.makeToken("lbracket", "[", start, start + 1, line, col)
          );
          this.advance();
          continue;
        case "]":
          tokens.push(
            this.makeToken("rbracket", "]", start, start + 1, line, col)
          );
          this.advance();
          continue;
        case ",":
          tokens.push(
            this.makeToken("comma", ",", start, start + 1, line, col)
          );
          this.advance();
          continue;
        case ":":
          if (this.peek2() === ":") {
            // :: is treated as op
            this.advance();
            this.advance();
            tokens.push(
              this.makeToken("op", "::", start, start + 2, line, col)
            );
            continue;
          }
          tokens.push(
            this.makeToken("colon", ":", start, start + 1, line, col)
          );
          this.advance();
          continue;
        case ";":
          tokens.push(
            this.makeToken("semicolon", ";", start, start + 1, line, col)
          );
          this.advance();
          continue;
        case ".":
          tokens.push(this.makeToken("dot", ".", start, start + 1, line, col));
          this.advance();
          continue;
        case "=":
          if (this.peek2() === ">") {
            this.advance();
            this.advance();
            tokens.push(
              this.makeToken("fat_arrow", "=>", start, start + 2, line, col)
            );
            continue;
          }
          break;
        case "-":
          if (this.peek2() === ">") {
            this.advance();
            this.advance();
            tokens.push(
              this.makeToken("arrow", "->", start, start + 2, line, col)
            );
            continue;
          }
          break;
        case '"':
          tokens.push(this.readString());
          continue;
      }

      if (this.isDigit(ch) || (ch === "-" && this.isDigit(this.peek2()))) {
        tokens.push(this.readNumber());
        continue;
      }

      if (this.isIdentStart(ch)) {
        tokens.push(this.readIdentOrKeyword());
        continue;
      }

      // operators (including multi-char)
      const op = this.readOperator();
      tokens.push(this.makeToken("op", op, start, this.i, line, col));
    }

    tokens.push(this.makeToken("eof", "", this.i, this.i, this.line, this.col));
    return tokens;
  }

  private readLineComment() {
    while (!this.isEOF() && this.peek() !== "\n") {
      this.advance();
    }
  }

  private readBlockComment(start: number, line: number, col: number) {
    // assumes current is / and next is *
    this.advance();
    this.advance();
    let depth = 1;
    while (!this.isEOF() && depth > 0) {
      if (this.peek() === "/" && this.peek2() === "*") {
        depth++;
        this.advance();
        this.advance();
        continue;
      }
      if (this.peek() === "*" && this.peek2() === "/") {
        depth--;
        this.advance();
        this.advance();
        continue;
      }
      if (this.peek() === "\n") {
        this.advance();
        this.line++;
        this.col = 1;
        continue;
      }
      this.advance();
    }

    if (depth > 0) {
      this.diags?.error("Unterminated block comment", {
        filePath: this.filePath,
        start,
        end: this.i,
        line,
        col,
      });
    }
  }

  private readIdentOrKeyword(): Token {
    const start = this.i;
    const line = this.line;
    const col = this.col;
    this.advance();
    while (!this.isEOF() && this.isIdentPart(this.peek())) this.advance();
    const text = this.src.slice(start, this.i);
    if (KEYWORDS.has(text)) {
      return this.makeToken("kw", text, start, this.i, line, col);
    }
    return this.makeToken("ident", text, start, this.i, line, col);
  }

  private readNumber(): Token {
    const start = this.i;
    const line = this.line;
    const col = this.col;
    if (this.peek() === "-") this.advance();
    while (!this.isEOF() && this.isDigit(this.peek())) this.advance();

    // Decimal fraction:
    // Avoid consuming member-access dots used for tuple indexing chains like `n.0.1`.
    // If the number is immediately preceded by '.', treat '.' as a separate token.
    const allowDecimal = start === 0 ? true : this.src[start - 1] !== ".";
    if (allowDecimal && this.peek() === "." && this.isDigit(this.peek2())) {
      this.advance();
      while (!this.isEOF() && this.isDigit(this.peek())) this.advance();
    }
    // optional suffix like U8, I32, F64
    while (!this.isEOF() && this.isIdentPart(this.peek())) this.advance();

    const text = this.src.slice(start, this.i);
    return this.makeToken("number", text, start, this.i, line, col);
  }

  private readString(): Token {
    const start = this.i;
    const line = this.line;
    const col = this.col;
    this.advance(); // opening quote
    while (!this.isEOF()) {
      const ch = this.peek();
      if (ch === "\\") {
        this.advance();
        if (!this.isEOF()) this.advance();
        continue;
      }
      if (ch === '"') {
        this.advance();
        break;
      }
      if (ch === "\n") {
        // allow but track
        this.advance();
        this.line++;
        this.col = 1;
        continue;
      }
      this.advance();
    }
    if (this.isEOF() && this.src[this.i - 1] !== '"') {
      this.diags?.error("Unterminated string literal", {
        filePath: this.filePath,
        start,
        end: this.i,
        line,
        col,
      });
    }
    const text = this.src.slice(start, this.i);
    return this.makeToken("string", text, start, this.i, line, col);
  }

  private readOperator(): string {
    // minimal set, extend later
    const start = this.i;
    const ch = this.peek();
    this.advance();
    const two = ch + this.peek();
    const three = two + this.peek2();

    const ops3 = new Set([">>=", "<<="]); // placeholder
    if (ops3.has(three)) {
      this.advance();
      this.advance();
      return three;
    }

    const ops2 = new Set([
      "==",
      "!=",
      "<=",
      ">=",
      "&&",
      "||",
      "+=",
      "-=",
      "*=",
      "/=",
      "%=",
      "<<",
      ">>",
    ]);
    if (ops2.has(two)) {
      this.advance();
      return two;
    }

    return this.src.slice(start, this.i);
  }

  private makeToken(
    kind: TokenKind,
    text: string,
    start: number,
    end: number,
    line?: number,
    col?: number
  ): Token {
    return {
      kind,
      text,
      start,
      end,
      line: line ?? this.line,
      col: col ?? this.col,
    };
  }

  private advance() {
    this.i++;
    this.col++;
  }

  private peek(): string {
    return this.src[this.i] ?? "";
  }

  private peek2(): string {
    return this.src[this.i + 1] ?? "";
  }

  private isEOF(): boolean {
    return this.i >= this.src.length;
  }

  private isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
  }

  private isIdentStart(ch: string): boolean {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
  }

  private isIdentPart(ch: string): boolean {
    return this.isIdentStart(ch) || this.isDigit(ch);
  }
}
