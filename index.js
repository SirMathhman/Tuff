export function execute(source) {
  if (!source || source.trim().length === 0) return 0;

  // Tokenize: numbers, operators (+, -, *, /), delimiters ( ) { }, identifiers/keywords, ; =
  const tokens = source.match(/\d+|[+\-*/(){}=;]|[a-zA-Z_]\w*/g);
  if (!tokens) throw new Error("Invalid source: " + source);

  let pos = 0;
  const scope = {}; // variable store for `let` declarations

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
    // Parse numbers, grouped expressions: (...) or {...}, and variable references
    const token = tokens[pos];

    if (token === "(") {
      pos++; // consume '('
      const result = parseExpr();
      if (pos >= tokens.length || tokens[pos] !== ")")
        throw new Error("Invalid source: " + source);
      pos++; // consume ')'
      return result;
    }

    if (token === "{") {
      pos++; // consume '{'
      let lastResult = 0;
      // Parse statements separated by ; until closing }
      while (pos < tokens.length && tokens[pos] !== "}") {
        const val = parseStatement();
        lastResult = val;
      }
      if (pos >= tokens.length || tokens[pos] !== "}")
        throw new Error("Invalid source: " + source);
      pos++; // consume '}'
      return lastResult;
    }

    // Variable reference (identifier that's not a keyword)
    if (/^[a-zA-Z_]\w*$/.test(token)) {
      pos++;
      if (!(token in scope)) throw new Error("Invalid source: " + source);
      return scope[token];
    }

    if (/^\d+$/.test(token)) {
      pos++;
      return parseInt(token, 10);
    }

    // Should not reach here — all token types are handled above
  }

  function parseStatement() {
    // Parse `let x = expr` declarations
    if (tokens[pos] === "let") {
      pos++; // consume 'let'
      const name = tokens[pos];
      if (!name || !/^[a-zA-Z_]\w*$/.test(name))
        throw new Error("Invalid source: " + source);
      pos++; // consume variable name
      if (tokens[pos] !== "=") throw new Error("Invalid source: " + source);
      pos++; // consume '='
      const value = parseExpr();
      scope[name] = value;
      if (pos < tokens.length && tokens[pos] === ";") {
        pos++; // consume ';'
      }
      return value;
    }

    // Plain expression — only valid as the last statement without trailing ;
    const result = parseExpr();
    if (pos < tokens.length && tokens[pos] === ";")
      throw new Error("Invalid source: " + source);
    return result;
  }

  // Parse top-level statements, returning the last value
  let lastResult = 0;
  while (pos < tokens.length) {
    lastResult = parseStatement();
  }
  return lastResult;
}
