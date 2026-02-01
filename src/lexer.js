/**
 * Lexer for Tuff Language
 * Tokenizes source code into a stream of tokens
 */

// Token types
const TokenType = {
  // Literals
  NUMBER: "NUMBER",
  STRING: "STRING",
  IDENTIFIER: "IDENTIFIER",

  // Keywords
  FN: "FN",
  VAR: "VAR",
  LET: "LET",
  MUT: "MUT",
  RETURN: "RETURN",
  IF: "IF",
  ELSE: "ELSE",
  WHILE: "WHILE",
  FOR: "FOR",
  IN: "IN",
  BREAK: "BREAK",
  CONTINUE: "CONTINUE",
  STRUCT: "STRUCT",
  MODULE: "MODULE",
  USE: "USE",
  FROM: "FROM",
  EXTERN: "EXTERN",
  TRUE: "TRUE",
  FALSE: "FALSE",
  NIL: "NIL",

  // Operators
  PLUS: "PLUS",
  MINUS: "MINUS",
  STAR: "STAR",
  SLASH: "SLASH",
  PERCENT: "PERCENT",
  EQ: "EQ",
  NEQ: "NEQ",
  LT: "LT",
  GT: "GT",
  LTE: "LTE",
  GTE: "GTE",
  ASSIGN: "ASSIGN",
  PLUS_ASSIGN: "PLUS_ASSIGN",
  MINUS_ASSIGN: "MINUS_ASSIGN",
  AND_AND: "AND_AND",
  OR_OR: "OR_OR",
  BANG: "BANG",
  AMPERSAND: "AMPERSAND",
  PIPE: "PIPE",
  CARET: "CARET",
  TILDE: "TILDE",
  LSHIFT: "LSHIFT",
  RSHIFT: "RSHIFT",
  PLUS_PLUS: "PLUS_PLUS",
  MINUS_MINUS: "MINUS_MINUS",
  DOTDOT: "DOTDOT",

  // Punctuation
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  LBRACE: "LBRACE",
  RBRACE: "RBRACE",
  LBRACKET: "LBRACKET",
  RBRACKET: "RBRACKET",
  SEMICOLON: "SEMICOLON",
  COMMA: "COMMA",
  DOT: "DOT",
  COLON: "COLON",
  ARROW: "ARROW",

  // Special
  EOF: "EOF",
  NEWLINE: "NEWLINE",
};

class Token {
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
  }

  toString() {
    return `Token(${this.type}, ${this.value}, ${this.line}:${this.column})`;
  }
}

class Lexer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.column = 1;
    this.tokens = [];

    // Keywords map
    this.keywords = {
      fn: TokenType.FN,
      var: TokenType.VAR,
      let: TokenType.LET,
      mut: TokenType.MUT,
      return: TokenType.RETURN,
      if: TokenType.IF,
      else: TokenType.ELSE,
      while: TokenType.WHILE,
      for: TokenType.FOR,
      in: TokenType.IN,
      break: TokenType.BREAK,
      continue: TokenType.CONTINUE,
      struct: TokenType.STRUCT,
      module: TokenType.MODULE,
      use: TokenType.USE,
      from: TokenType.FROM,
      extern: TokenType.EXTERN,
      true: TokenType.TRUE,
      false: TokenType.FALSE,
      nil: TokenType.NIL,
    };
  }

  peek(offset = 0) {
    const pos = this.pos + offset;
    if (pos >= this.source.length) return "\0";
    return this.source[pos];
  }

  advance() {
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

  skipWhitespace() {
    while (
      this.peek() === " " ||
      this.peek() === "\t" ||
      this.peek() === "\r"
    ) {
      this.advance();
    }
  }

  skipComment() {
    if (this.peek() === "/" && this.peek(1) === "/") {
      while (this.peek() !== "\n" && this.peek() !== "\0") {
        this.advance();
      }
    }
  }

  readString(quote) {
    let value = "";
    this.advance(); // skip opening quote
    while (this.peek() !== quote && this.peek() !== "\0") {
      if (this.peek() === "\\") {
        this.advance();
        const escaped = this.peek();
        switch (escaped) {
          case "n":
            value += "\n";
            break;
          case "t":
            value += "\t";
            break;
          case "r":
            value += "\r";
            break;
          case "\\":
            value += "\\";
            break;
          case '"':
            value += '"';
            break;
          case "'":
            value += "'";
            break;
          default:
            value += escaped;
        }
        this.advance();
      } else {
        value += this.advance();
      }
    }
    if (this.peek() === quote) {
      this.advance(); // skip closing quote
    }
    return value;
  }

  readNumber() {
    let value = "";
    while (/[0-9]/.test(this.peek())) {
      value += this.advance();
    }
    // Support decimal numbers
    if (this.peek() === "." && /[0-9]/.test(this.peek(1))) {
      value += this.advance(); // .
      while (/[0-9]/.test(this.peek())) {
        value += this.advance();
      }
    }
    return parseFloat(value);
  }

  readIdentifier() {
    let value = "";
    while (/[a-zA-Z0-9_]/.test(this.peek())) {
      value += this.advance();
    }
    return value;
  }

  addToken(type, value = null) {
    this.tokens.push(
      new Token(
        type,
        value,
        this.line,
        this.column - (value ? String(value).length : 1),
      ),
    );
  }

  tokenize() {
    while (this.pos < this.source.length) {
      this.skipWhitespace();

      // Skip comments
      if (this.peek() === "/" && this.peek(1) === "/") {
        this.skipComment();
        continue;
      }

      // Newline
      if (this.peek() === "\n") {
        this.advance();
        continue;
      }

      const ch = this.peek();

      // Strings
      if (ch === '"' || ch === "'") {
        const value = this.readString(ch);
        this.addToken(TokenType.STRING, value);
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch)) {
        const value = this.readNumber();
        this.addToken(TokenType.NUMBER, value);
        continue;
      }

      // Identifiers and keywords
      if (/[a-zA-Z_]/.test(ch)) {
        const value = this.readIdentifier();
        const type = this.keywords[value] || TokenType.IDENTIFIER;
        this.addToken(type, value);
        continue;
      }

      // Two-character operators
      const twoChar = ch + this.peek(1);
      let matched = false;

      const twoCharTokens = {
        "==": TokenType.EQ,
        "!=": TokenType.NEQ,
        "<=": TokenType.LTE,
        ">=": TokenType.GTE,
        "&&": TokenType.AND_AND,
        "||": TokenType.OR_OR,
        "+=": TokenType.PLUS_ASSIGN,
        "-=": TokenType.MINUS_ASSIGN,
        "++": TokenType.PLUS_PLUS,
        "--": TokenType.MINUS_MINUS,
        "<<": TokenType.LSHIFT,
        ">>": TokenType.RSHIFT,
        "=>": TokenType.ARROW,
        "..": TokenType.DOTDOT,
      };

      if (twoCharTokens[twoChar]) {
        this.advance();
        this.advance();
        this.addToken(twoCharTokens[twoChar], twoChar);
        continue;
      }

      // Single-character tokens
      const singleCharTokens = {
        "+": TokenType.PLUS,
        "-": TokenType.MINUS,
        "*": TokenType.STAR,
        "/": TokenType.SLASH,
        "%": TokenType.PERCENT,
        "=": TokenType.ASSIGN,
        "<": TokenType.LT,
        ">": TokenType.GT,
        "!": TokenType.BANG,
        "&": TokenType.AMPERSAND,
        "|": TokenType.PIPE,
        "^": TokenType.CARET,
        "~": TokenType.TILDE,
        "(": TokenType.LPAREN,
        ")": TokenType.RPAREN,
        "{": TokenType.LBRACE,
        "}": TokenType.RBRACE,
        "[": TokenType.LBRACKET,
        "]": TokenType.RBRACKET,
        ";": TokenType.SEMICOLON,
        ",": TokenType.COMMA,
        ".": TokenType.DOT,
        ":": TokenType.COLON,
      };

      if (singleCharTokens[ch]) {
        this.advance();
        this.addToken(singleCharTokens[ch], ch);
        continue;
      }

      // Unknown character
      throw new Error(
        `Unexpected character: '${ch}' at ${this.line}:${this.column}`,
      );
    }

    this.addToken(TokenType.EOF, null);
    return this.tokens;
  }
}

export { Lexer, Token, TokenType };
