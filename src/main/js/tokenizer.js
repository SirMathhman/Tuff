// Token types
export const TokenType = {
  EXTERN_LET_IMPORT_DECLARATION: "EXTERN_LET_IMPORT_DECLARATION",
  OUT: "OUT",
  LET: "LET",
  MUT: "MUT",
  STRUCT: "STRUCT",
  TYPE_ALIAS: "TYPE_ALIAS",
  EXTERN_TYPE_DECLARATION: "EXTERN_TYPE_DECLARATION",
  EXTERN_LET_DECLARATION: "EXTERN_LET_DECLARATION",
  EXTERN_FN_DECLARATION: "EXTERN_FN_DECLARATION",
  FN_DECLARATION: "FN_DECLARATION",
  THIS: "THIS",
  IDENT: "IDENT",
  NUMBER: "NUMBER",
  STRING_LITERAL: "STRING_LITERAL",
  PLUS: "+",
  MINUS: "-",
  STAR: "*",
  SLASH: "/",
  LPAREN: "(",
  RPAREN: ")",
  LBRACE: "{",
  RBRACE: "}",
  LBRACKET: "[",
  RBRACKET: "]",
  LT: "<",
  GT: ">",
  LE: "<=",
  GE: ">=",
  EQ: "==",
  NE: "!=",
  TRUE: "true",
  FALSE: "false",
  IF: "if",
  ELSE: "else",
  COLON: ":",
  COMMA: ",",
  PIPE: "|",
  DOT: ".",
  FAT_ARROW: "=>",
  SEMICOLON: ";",
  EQUALS: "=",
  PLUS_EQ: "+=",
  MINUS_EQ: "-=",
  STAR_EQ: "*=",
  SLASH_EQ: "/=",
  EOF: "<EOF>",
};

export function tokenize(source) {
  const tokens = [];
  let pos = 0;
  let line = 1; // 1-indexed
  let col = 0; // 0-indexed

  // Helper to skip characters until a semicolon is found, tracking position.
  function skipToSemicolon() {
    while (pos < source.length && !/;/.test(source[pos])) {
      if (source[pos] === "\n") {
        line++;
        col = 0;
      } else {
        col++;
      }
      pos++;
    }
    // Consume semicolon
    if (pos < source.length) {
      pos++;
      col++;
    }
  }

  while (pos < source.length) {
    // Skip whitespace — track newlines for accurate positions
    if (/\s/.test(source[pos])) {
      if (source[pos] === "\n") {
        line++;
        col = 0;
      } else {
        col++;
      }
      pos++;
      continue;
    }

    // Skip block comments /* ... */
    if (source[pos] === "/" && source[pos + 1] === "*") {
      pos += 2; // skip '/*'
      while (
        pos < source.length - 1 &&
        !(source[pos] === "*" && source[pos + 1] === "/")
      ) {
        if (source[pos] === "\n") {
          line++;
          col = 0;
        } else {
          col++;
        }
        pos++;
      }
      if (pos < source.length) {
        pos += 2; // skip '*/'
      }
      continue;
    }

    // Semicolon
    if (source[pos] === ";") {
      tokens.push({ type: TokenType.SEMICOLON, value: ";", line, col });
      pos++;
      col++;
      continue;
    }

    // Parentheses
    if (source[pos] === "(") {
      tokens.push({ type: TokenType.LPAREN, value: "(", line, col });
      pos++;
      col++;
      continue;
    }
    if (source[pos] === ")") {
      tokens.push({ type: TokenType.RPAREN, value: ")", line, col });
      pos++;
      col++;
      continue;
    }

    // Braces
    if (source[pos] === "{") {
      tokens.push({ type: TokenType.LBRACE, value: "{", line, col });
      pos++;
      col++;
      continue;
    }
    if (source[pos] === "}") {
      tokens.push({ type: TokenType.RBRACE, value: "}", line, col });
      pos++;
      col++;
      continue;
    }

    // Brackets (slice/array types)
    if (source[pos] === "[") {
      tokens.push({ type: TokenType.LBRACKET, value: "[", line, col });
      pos++;
      col++;
      continue;
    }
    if (source[pos] === "]") {
      tokens.push({ type: TokenType.RBRACKET, value: "]", line, col });
      pos++;
      col++;
      continue;
    }

    // Angle brackets / comparison operators
    if (source[pos] === "<") {
      const startLine = line;
      const startCol = col;
      if (pos + 1 < source.length && source[pos + 1] === "=") {
        tokens.push({
          type: TokenType.LE,
          value: "<=",
          line: startLine,
          col: startCol,
        });
        pos += 2;
        col += 2;
      } else {
        tokens.push({
          type: TokenType.LT,
          value: "<",
          line: startLine,
          col: startCol,
        });
        pos++;
        col++;
      }
      continue;
    }
    if (source[pos] === ">") {
      const startLine = line;
      const startCol = col;
      if (pos + 1 < source.length && source[pos + 1] === "=") {
        tokens.push({
          type: TokenType.GE,
          value: ">=",
          line: startLine,
          col: startCol,
        });
        pos += 2;
        col += 2;
      } else {
        tokens.push({
          type: TokenType.GT,
          value: ">",
          line: startLine,
          col: startCol,
        });
        pos++;
        col++;
      }
      continue;
    }

    // Colon (type annotation)
    if (source[pos] === ":") {
      tokens.push({ type: TokenType.COLON, value: ":", line, col });
      pos++;
      col++;
      continue;
    }

    // Comma (field separator)
    if (source[pos] === ",") {
      tokens.push({ type: TokenType.COMMA, value: ",", line, col });
      pos++;
      col++;
      continue;
    }

    // Pipe (union types)
    if (source[pos] === "|") {
      tokens.push({ type: TokenType.PIPE, value: "|", line, col });
      pos++;
      col++;
      continue;
    }

    // Dot (property access)
    if (source[pos] === ".") {
      tokens.push({ type: TokenType.DOT, value: ".", line, col });
      pos++;
      col++;
      continue;
    }

    // Fat arrow '=>' or equals '=' or double equals '=='
    if (source[pos] === "=") {
      const startLine = line;
      const startCol = col;
      if (pos + 1 < source.length && source[pos + 1] === ">") {
        tokens.push({
          type: TokenType.FAT_ARROW,
          value: "=>",
          line: startLine,
          col: startCol,
        });
        pos += 2;
        col += 2;
      } else if (pos + 1 < source.length && source[pos + 1] === "=") {
        tokens.push({
          type: TokenType.EQ,
          value: "==",
          line: startLine,
          col: startCol,
        });
        pos += 2;
        col += 2;
      } else {
        tokens.push({
          type: TokenType.EQUALS,
          value: "=",
          line: startLine,
          col: startCol,
        });
        pos++;
        col++;
      }
      continue;
    }

    // Not equal '!='
    if (source[pos] === "!") {
      const startLine = line;
      const startCol = col;
      if (pos + 1 < source.length && source[pos + 1] === "=") {
        tokens.push({
          type: TokenType.NE,
          value: "!=",
          line: startLine,
          col: startCol,
        });
        pos += 2;
        col += 2;
      } else {
        return {
          variant: "err",
          error: `Unexpected character '!' at ${startLine}:${startCol}`,
        };
      }
      continue;
    }

    // Operators (with lookahead for compound assignment)
    if ("+-*/".includes(source[pos])) {
      const startLine = line;
      const startCol = col;
      const op = source[pos];

      // Check for compound assignment operators: +=, -=, *=, /=
      if (pos + 1 < source.length && source[pos + 1] === "=") {
        const compoundMap = {
          "+": { type: TokenType.PLUS_EQ, value: "+=" },
          "-": { type: TokenType.MINUS_EQ, value: "-=" },
          "*": { type: TokenType.STAR_EQ, value: "*=" },
          "/": { type: TokenType.SLASH_EQ, value: "/=" },
        };
        if (compoundMap[op]) {
          tokens.push({
            ...compoundMap[op],
            line: startLine,
            col: startCol,
          });
          pos += 2;
          col += 2;
          continue;
        }
      }

      const operatorMap = {
        "+": "PLUS",
        "-": "MINUS",
        "*": "STAR",
        "/": "SLASH",
      };
      tokens.push({
        type: TokenType[operatorMap[op]],
        value: op,
        line: startLine,
        col: startCol,
      });
      pos++;
      col++;
      continue;
    }

    // Numbers (integers)
    if (/[0-9]/.test(source[pos])) {
      const startLine = line;
      const startCol = col;
      let num = "";
      while (pos < source.length && /[0-9]/.test(source[pos])) {
        num += source[pos];
        pos++;
        col++;
      }
      tokens.push({
        type: TokenType.NUMBER,
        value: parseInt(num, 10),
        line: startLine,
        col: startCol,
      });
      continue;
    }

    // String literals (double-quoted)
    if (source[pos] === '"') {
      const startLine = line;
      const startCol = col;
      let str = "";
      pos++;
      col++; // consume opening quote
      while (
        pos < source.length &&
        source[pos] !== '"' &&
        source[pos] !== "\n"
      ) {
        if (source[pos] === "\\") {
          pos++;
          col++;
          switch (source[pos]) {
            case "n":
              str += "\n";
              break;
            case "t":
              str += "\t";
              break;
            case '"':
              str += '"';
              break;
            default:
              str += source[pos];
          }
        } else {
          str += source[pos];
        }
        pos++;
        col++;
      }
      if (pos < source.length) {
        pos++;
        col++;
      } // consume closing quote
      tokens.push({
        type: TokenType.STRING_LITERAL,
        value: str,
        line: startLine,
        col: startCol,
      });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(source[pos])) {
      const startLine = line;
      const startCol = col;
      let name = "";
      while (pos < source.length && /[a-zA-Z_0-9]/.test(source[pos])) {
        name += source[pos];
        pos++;
        col++;
      }

      // Check for keyword
      if (name === "out") {
        tokens.push({
          type: TokenType.OUT,
          value: "out",
          line: startLine,
          col: startCol,
        });
      } else if (name === "this") {
        tokens.push({
          type: TokenType.THIS,
          value: "this",
          line: startLine,
          col: startCol,
        });
      } else if (name === "true") {
        tokens.push({
          type: TokenType.TRUE,
          value: true,
          line: startLine,
          col: startCol,
        });
      } else if (name === "false") {
        tokens.push({
          type: TokenType.FALSE,
          value: false,
          line: startLine,
          col: startCol,
        });
      } else if (name === "if") {
        tokens.push({
          type: TokenType.IF,
          value: "if",
          line: startLine,
          col: startCol,
        });
      } else if (name === "else") {
        tokens.push({
          type: TokenType.ELSE,
          value: "else",
          line: startLine,
          col: startCol,
        });
      } else if (name === "mut") {
        tokens.push({
          type: TokenType.MUT,
          value: "mut",
          line: startLine,
          col: startCol,
        });
      } else if (name === "let") {
        tokens.push({
          type: TokenType.LET,
          value: "let",
          line: startLine,
          col: startCol,
        });
      } else if (name === "struct") {
        tokens.push({
          type: TokenType.STRUCT,
          value: "struct",
          line: startLine,
          col: startCol,
        });
      } else if (name === "type") {
        tokens.push({
          type: TokenType.TYPE_ALIAS,
          value: "type",
          line: startLine,
          col: startCol,
        });
      } else if (name === "fn") {
        tokens.push({
          type: TokenType.FN_DECLARATION,
          value: "fn",
          line: startLine,
          col: startCol,
        });
      } else if (name === "extern") {
        const rest = source.slice(pos);
        // Check for extern type declaration: extern type IDENT ;
        if (/^[\s]*type/.test(rest)) {
          tokens.push({
            type: TokenType.EXTERN_TYPE_DECLARATION,
            value: "extern",
            line: startLine,
            col: startCol,
          });
          skipToSemicolon();
        } else if (/^[\s]*let/.test(rest)) {
          // Check for extern let import with destructuring: extern let { x , y } = extern IDENT ;
          const match = rest.match(
            /^[ \t]+let[ \t]+\{([^}]+)\}[ \t]*=[ \t]*extern[ \t]+([a-zA-Z_][a-zA-Z0-9_]*)/,
          );
          if (match) {
            const bindings = match[1]
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            tokens.push({
              type: TokenType.EXTERN_LET_IMPORT_DECLARATION,
              value: { bindings, moduleName: match[2] },
              line: startLine,
              col: startCol,
            });
            skipToSemicolon();
          } else {
            // Check for extern let declaration: extern let IDENT : Type = extern ... ;
            const bindingMatch = rest.match(
              /^[ \t]+let[ \t]+([a-zA-Z_][a-zA-Z0-9_]*)/,
            );
            tokens.push({
              type: TokenType.EXTERN_LET_DECLARATION,
              value: {
                bindingName: bindingMatch ? bindingMatch[1] : "unknown",
              },
              line: startLine,
              col: startCol,
            });
            skipToSemicolon();
          }
        } else if (/^[\s]*fn/.test(rest)) {
          // Check for extern fn declaration: extern fn NAME(...) : Type ;
          tokens.push({
            type: TokenType.EXTERN_FN_DECLARATION,
            value: "extern",
            line: startLine,
            col: startCol,
          });
          skipToSemicolon();
        } else {
          tokens.push({
            type: TokenType.IDENT,
            value: name,
            line: startLine,
            col: startCol,
          });
        }
      } else {
        tokens.push({
          type: TokenType.IDENT,
          value: name,
          line: startLine,
          col: startCol,
        });
      }
      continue;
    }

    return {
      variant: "err",
      error: `Unexpected character '${source[pos]}' at ${line}:${col}`,
    };
  }

  tokens.push({ type: TokenType.EOF, value: null, line, col });
  return { variant: "ok", value: tokens };
}
