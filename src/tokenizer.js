// Token types
export const TokenType = {
  LET: "LET",
  IDENT: "IDENT",
  NUMBER: "NUMBER",
  PLUS: "+",
  MINUS: "-",
  STAR: "*",
  SLASH: "/",
  LPAREN: "(",
  RPAREN: ")",
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
