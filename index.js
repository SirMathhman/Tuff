export function execute(source) {
  if (!source || source.trim().length === 0) return 0;

  // Tokenize: numbers, operators (+, -, *, /), and parentheses ( )
  const tokens = source.match(/\d+|[+\-*/()]/g);
  if (!tokens) throw new Error("Invalid source: " + source);

  let pos = 0;

  function parseExpr() {
    // Parse addition/subtraction (lowest precedence)
    let result = parseTerm();

    while (
      pos < tokens.length &&
      (tokens[pos] === "+" || tokens[pos] === "-")
    ) {
      const op = tokens[pos++];
      const right = parseTerm();
      if (op === "+") {
        result += right;
      } else {
        result -= right;
      }
    }

    return result;
  }

  function parseTerm() {
    // Parse multiplication/division (higher precedence)
    let result = parseFactor();

    while (
      pos < tokens.length &&
      (tokens[pos] === "*" || tokens[pos] === "/")
    ) {
      const op = tokens[pos++];
      const right = parseFactor();
      if (op === "*") {
        result *= right;
      } else {
        result /= right;
      }
    }

    return result;
  }

  function parseFactor() {
    // Parse numbers and parenthesized expressions
    const token = tokens[pos];

    if (token === "(") {
      pos++; // consume '('
      const result = parseExpr();
      if (pos >= tokens.length || tokens[pos] !== ")")
        throw new Error("Invalid source: " + source);
      pos++; // consume ')'
      return result;
    }

    if (/^\d+$/.test(token)) {
      pos++;
      return parseInt(token, 10);
    }

    throw new Error("Invalid source: " + source);
  }

  const result = parseExpr();
  return result;
}
