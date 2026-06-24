// Token types
export const TokenType = {
  LET: "LET",
  STRUCT: "STRUCT",
  TYPE_ALIAS: "TYPE_ALIAS",
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
  COLON: ":",
  COMMA: ",",
  PIPE: "|",
  DOT: ".",
  SEMICOLON: ";",
  EQUALS: "=",
  EOF: "<EOF>",
};

export function tokenize(source) {
  const tokens = [];
  let pos = 0;

  while (pos < source.length) {
    // Skip whitespace
    if (/\s/.test(source[pos])) {
      pos++;
      continue;
    }

    // Semicolon
    if (source[pos] === ";") {
      tokens.push({ type: TokenType.SEMICOLON, value: ";" });
      pos++;
      continue;
    }

    // Parentheses
    if (source[pos] === "(") {
      tokens.push({ type: TokenType.LPAREN, value: "(" });
      pos++;
      continue;
    }
    if (source[pos] === ")") {
      tokens.push({ type: TokenType.RPAREN, value: ")" });
      pos++;
      continue;
    }

    // Braces
    if (source[pos] === "{") {
      tokens.push({ type: TokenType.LBRACE, value: "{" });
      pos++;
      continue;
    }
    if (source[pos] === "}") {
      tokens.push({ type: TokenType.RBRACE, value: "}" });
      pos++;
      continue;
    }

    // Brackets (slice/array types)
    if (source[pos] === "[") {
      tokens.push({ type: TokenType.LBRACKET, value: "[" });
      pos++;
      continue;
    }
    if (source[pos] === "]") {
      tokens.push({ type: TokenType.RBRACKET, value: "]" });
      pos++;
      continue;
    }

    // Angle brackets (generics)
    if (source[pos] === "<") {
      tokens.push({ type: TokenType.LT, value: "<" });
      pos++;
      continue;
    }
    if (source[pos] === ">") {
      tokens.push({ type: TokenType.GT, value: ">" });
      pos++;

      // Colon (type annotation)
      if (source[pos] === ":") {
        tokens.push({ type: TokenType.COLON, value: ":" });
        pos++;
        continue;
      }
      continue;
    }

    // Colon (type annotation)
    if (source[pos] === ":") {
      tokens.push({ type: TokenType.COLON, value: ":" });
      pos++;
      continue;
    }

    // Comma (field separator)
    if (source[pos] === ",") {
      tokens.push({ type: TokenType.COMMA, value: "," });
      pos++;
      continue;
    }

    // Pipe (union types)
    if (source[pos] === "|") {
      tokens.push({ type: TokenType.PIPE, value: "|" });
      pos++;
      continue;
    }

    // Dot (property access)
    if (source[pos] === ".") {
      tokens.push({ type: TokenType.DOT, value: "." });
      pos++;
      continue;
    }

    // Equals sign
    if (source[pos] === "=") {
      tokens.push({ type: TokenType.EQUALS, value: "=" });
      pos++;
      continue;
    }

    // Operators
    if ("+-*/".includes(source[pos])) {
      const op = source[pos];
      const operatorMap = {
        "+": "PLUS",
        "-": "MINUS",
        "*": "STAR",
        "/": "SLASH",
      };
      tokens.push({ type: TokenType[operatorMap[op]], value: op });
      pos++;
      continue;
    }

    // Numbers (integers)
    if (/[0-9]/.test(source[pos])) {
      let num = "";
      while (pos < source.length && /[0-9]/.test(source[pos])) {
        num += source[pos];
        pos++;
      }
      tokens.push({ type: TokenType.NUMBER, value: parseInt(num, 10) });
      continue;
    }

    // String literals (double-quoted)
    if (source[pos] === '"') {
      let str = "";
      pos++; // consume opening quote
      while (
        pos < source.length &&
        source[pos] !== '"' &&
        source[pos] !== "\n"
      ) {
        if (source[pos] === "\\") {
          pos++;
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
      }
      if (pos < source.length) pos++; // consume closing quote
      tokens.push({ type: TokenType.STRING_LITERAL, value: str });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(source[pos])) {
      let name = "";
      while (pos < source.length && /[a-zA-Z_0-9]/.test(source[pos])) {
        name += source[pos];
        pos++;
      }

      // Check for keyword
      if (name === "let") {
        tokens.push({ type: TokenType.LET, value: "let" });
      } else if (name === "struct") {
        tokens.push({ type: TokenType.STRUCT, value: "struct" });
      } else if (name === "type") {
        tokens.push({ type: TokenType.TYPE_ALIAS, value: "type" });
      } else {
        tokens.push({ type: TokenType.IDENT, value: name });
      }
      continue;
    }

    return {
      variant: "err",
      error: `Unexpected character '${source[pos]}' at position ${pos}`,
    };
  }

  tokens.push({ type: TokenType.EOF, value: null });
  return { variant: "ok", value: tokens };
}
