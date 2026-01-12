/* eslint-disable complexity, no-restricted-syntax, max-lines-per-function */
/**
 * Lexer for Tuff language.
 * Transforms source code string into a stream of tokens.
 */

// ============================================================================
// Token Types
// ============================================================================

export type TokenKind =
  // Literals
  | "number"
  | "identifier"
  | "true"
  | "false"
  // Keywords
  | "let"
  | "mut"
  | "fn"
  | "struct"
  | "type"
  | "if"
  | "else"
  | "match"
  | "case"
  | "while"
  | "for"
  | "in"
  | "return"
  | "yield"
  | "break"
  | "continue"
  | "then"
  | "this"
  // Operators
  | "plus" // +
  | "minus" // -
  | "star" // *
  | "slash" // /
  | "ampersand" // &
  | "pipe" // |
  | "bang" // !
  | "equals" // =
  | "less" // <
  | "greater" // >
  | "dot" // .
  | "dotdot" // ..
  | "comma" // ,
  | "colon" // :
  | "semicolon" // ;
  | "underscore" // _
  // Multi-char operators
  | "arrow" // =>
  | "eq" // ==
  | "neq" // !=
  | "leq" // <=
  | "geq" // >=
  | "and" // &&
  | "or" // ||
  | "pluseq" // +=
  | "minuseq" // -=
  | "stareq" // *=
  | "slasheq" // /=
  // Delimiters
  | "lparen" // (
  | "rparen" // )
  | "lbrace" // {
  | "rbrace" // }
  | "lbracket" // [
  | "rbracket" // ]
  // Special
  | "eof";

export interface Token {
  kind: TokenKind;
  value: string; // Raw text of the token
  line: number; // 1-indexed line number
  column: number; // 1-indexed column number
  pos: number; // 0-indexed position in source
}

// ============================================================================
// Keyword Map
// ============================================================================

const KEYWORDS: Map<string, TokenKind> = new Map([
  ["let", "let"],
  ["mut", "mut"],
  ["fn", "fn"],
  ["struct", "struct"],
  ["type", "type"],
  ["if", "if"],
  ["else", "else"],
  ["match", "match"],
  ["case", "case"],
  ["while", "while"],
  ["for", "for"],
  ["in", "in"],
  ["return", "return"],
  ["yield", "yield"],
  ["break", "break"],
  ["continue", "continue"],
  ["then", "then"],
  ["this", "this"],
  ["true", "true"],
  ["false", "false"],
]);

// ============================================================================
// Character Utilities
// ============================================================================

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isDigit(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isIdentifierStart(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;
}

function isIdentifierPart(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch);
}

// ============================================================================
// Lexer Class
// ============================================================================

export class Lexer {
  private readonly source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Tokenize the entire source and return an array of tokens.
   */
  tokenize(): Token[] {
    this.tokens = [];
    this.pos = 0;
    this.line = 1;
    this.column = 1;

    while (this.pos < this.source.length) {
      this.skipWhitespace();
      if (this.pos >= this.source.length) break;
      this.scanToken();
    }

    this.tokens.push({
      kind: "eof",
      value: "",
      line: this.line,
      column: this.column,
      pos: this.pos,
    });

    return this.tokens;
  }

  private peek(offset: number = 0): string {
    const idx = this.pos + offset;
    if (idx >= this.source.length) return "\0";
    return this.source[idx];
  }

  private advance(): string {
    const ch = this.source[this.pos];
    this.pos++;
    if (ch === "\n") {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private skipWhitespace(): void {
    while (this.pos < this.source.length && isWhitespace(this.peek())) {
      this.advance();
    }
  }

  private addToken(kind: TokenKind, value: string, startPos: number, startLine: number, startCol: number): void {
    this.tokens.push({
      kind,
      value,
      line: startLine,
      column: startCol,
      pos: startPos,
    });
  }

  private scanToken(): void {
    const startPos = this.pos;
    const startLine = this.line;
    const startCol = this.column;
    const ch = this.peek();

    // Single-character tokens
    if (ch === "(") {
      this.advance();
      this.addToken("lparen", "(", startPos, startLine, startCol);
      return;
    }
    if (ch === ")") {
      this.advance();
      this.addToken("rparen", ")", startPos, startLine, startCol);
      return;
    }
    if (ch === "{") {
      this.advance();
      this.addToken("lbrace", "{", startPos, startLine, startCol);
      return;
    }
    if (ch === "}") {
      this.advance();
      this.addToken("rbrace", "}", startPos, startLine, startCol);
      return;
    }
    if (ch === "[") {
      this.advance();
      this.addToken("lbracket", "[", startPos, startLine, startCol);
      return;
    }
    if (ch === "]") {
      this.advance();
      this.addToken("rbracket", "]", startPos, startLine, startCol);
      return;
    }
    if (ch === ",") {
      this.advance();
      this.addToken("comma", ",", startPos, startLine, startCol);
      return;
    }
    if (ch === ":") {
      this.advance();
      this.addToken("colon", ":", startPos, startLine, startCol);
      return;
    }
    if (ch === ";") {
      this.advance();
      this.addToken("semicolon", ";", startPos, startLine, startCol);
      return;
    }
    if (ch === "_") {
      // Check if it's a standalone underscore or start of identifier
      if (!isIdentifierPart(this.peek(1))) {
        this.advance();
        this.addToken("underscore", "_", startPos, startLine, startCol);
        return;
      }
      // Fall through to identifier
    }

    // Multi-character operators
    if (ch === "=") {
      this.advance();
      if (this.peek() === ">") {
        this.advance();
        this.addToken("arrow", "=>", startPos, startLine, startCol);
      } else if (this.peek() === "=") {
        this.advance();
        this.addToken("eq", "==", startPos, startLine, startCol);
      } else {
        this.addToken("equals", "=", startPos, startLine, startCol);
      }
      return;
    }

    if (ch === "!") {
      this.advance();
      if (this.peek() === "=") {
        this.advance();
        this.addToken("neq", "!=", startPos, startLine, startCol);
      } else {
        this.addToken("bang", "!", startPos, startLine, startCol);
      }
      return;
    }

    if (ch === "<") {
      this.advance();
      if (this.peek() === "=") {
        this.advance();
        this.addToken("leq", "<=", startPos, startLine, startCol);
      } else {
        this.addToken("less", "<", startPos, startLine, startCol);
      }
      return;
    }

    if (ch === ">") {
      this.advance();
      if (this.peek() === "=") {
        this.advance();
        this.addToken("geq", ">=", startPos, startLine, startCol);
      } else {
        this.addToken("greater", ">", startPos, startLine, startCol);
      }
      return;
    }

    if (ch === "&") {
      this.advance();
      if (this.peek() === "&") {
        this.advance();
        this.addToken("and", "&&", startPos, startLine, startCol);
      } else {
        this.addToken("ampersand", "&", startPos, startLine, startCol);
      }
      return;
    }

    if (ch === "|") {
      this.advance();
      if (this.peek() === "|") {
        this.advance();
        this.addToken("or", "||", startPos, startLine, startCol);
      } else {
        this.addToken("pipe", "|", startPos, startLine, startCol);
      }
      return;
    }

    if (ch === "+") {
      this.advance();
      if (this.peek() === "=") {
        this.advance();
        this.addToken("pluseq", "+=", startPos, startLine, startCol);
      } else {
        this.addToken("plus", "+", startPos, startLine, startCol);
      }
      return;
    }

    if (ch === "-") {
      this.advance();
      if (this.peek() === "=") {
        this.advance();
        this.addToken("minuseq", "-=", startPos, startLine, startCol);
      } else {
        this.addToken("minus", "-", startPos, startLine, startCol);
      }
      return;
    }

    if (ch === "*") {
      this.advance();
      if (this.peek() === "=") {
        this.advance();
        this.addToken("stareq", "*=", startPos, startLine, startCol);
      } else {
        this.addToken("star", "*", startPos, startLine, startCol);
      }
      return;
    }

    if (ch === "/") {
      this.advance();
      if (this.peek() === "=") {
        this.advance();
        this.addToken("slasheq", "/=", startPos, startLine, startCol);
      } else {
        this.addToken("slash", "/", startPos, startLine, startCol);
      }
      return;
    }

    if (ch === ".") {
      this.advance();
      if (this.peek() === ".") {
        this.advance();
        this.addToken("dotdot", "..", startPos, startLine, startCol);
      } else {
        this.addToken("dot", ".", startPos, startLine, startCol);
      }
      return;
    }

    // Numbers
    if (isDigit(ch)) {
      this.scanNumber(startPos, startLine, startCol);
      return;
    }

    // Identifiers and keywords
    if (isIdentifierStart(ch)) {
      this.scanIdentifier(startPos, startLine, startCol);
      return;
    }

    // Unknown character - throw error
    throw new Error(`Unexpected character '${ch}' at line ${this.line}, column ${this.column}`);
  }

  private scanNumber(startPos: number, startLine: number, startCol: number): void {
    // Consume all digits
    while (isDigit(this.peek())) {
      this.advance();
    }

    // Check for type suffix (I8, U32, etc.)
    if (this.peek() === "I" || this.peek() === "U" || this.peek() === "i" || this.peek() === "u") {
      this.advance();
      while (isDigit(this.peek())) {
        this.advance();
      }
    }

    const value = this.source.slice(startPos, this.pos);
    this.addToken("number", value, startPos, startLine, startCol);
  }

  private scanIdentifier(startPos: number, startLine: number, startCol: number): void {
    while (isIdentifierPart(this.peek())) {
      this.advance();
    }

    const value = this.source.slice(startPos, this.pos);
    const keyword = KEYWORDS.get(value);
    const kind: TokenKind = keyword ?? "identifier";
    this.addToken(kind, value, startPos, startLine, startCol);
  }
}

// ============================================================================
// Convenience function
// ============================================================================

export function tokenize(source: string): Token[] {
  return new Lexer(source).tokenize();
}
