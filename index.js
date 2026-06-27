export function execute(source) {
  if (!source || source.trim().length === 0) return 0;

  // Tokenize: numbers, operators (+, -, *, /, ||, &&, <=, >=, ==, !=), delimiters ( ) { }, identifiers/keywords, ; =
  const tokens = source.match(
    /\d+|[|]{2}|[&]{2}|<=|>=|==|!=|[+\-*/(){}<>=;]|[a-zA-Z_]\w*/g,
  );
  if (!tokens) throw new Error("Invalid source: " + source);

  let pos = 0;
  // Scope stack for block scoping — inner blocks shadow outer declarations
  const scopeStack = [{}];

  function lookup(name) {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (name in scopeStack[i]) return scopeStack[i][name];
    }
    throw new Error("Invalid source: " + source);
  }

  function assign(name, value) {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      if (name in scopeStack[i]) {
        const entry = scopeStack[i][name];
        if (!entry.mutable)
          throw new Error("Cannot reassign immutable variable");
        entry.value = value;
        return;
      }
    }
    throw new Error("Invalid source: " + source);
  }

  function parseComparisonExpr() {
    // Parse comparison operators (<, >, <=, >=, ==, !=) between logical AND and arithmetic
    let result = parseExpr();
    let hasComparison = false;

    while (
      pos < tokens.length &&
      (tokens[pos] === "<" ||
        tokens[pos] === ">" ||
        tokens[pos] === "<=" ||
        tokens[pos] === ">=" ||
        tokens[pos] === "==" ||
        tokens[pos] === "!=")
    ) {
      const op = tokens[pos++];
      const right = parseExpr();
      if (op === "<") {
        result = result < right;
      } else if (op === ">") {
        result = result > right;
      } else if (op === "<=") {
        result = result <= right;
      } else if (op === ">=") {
        result = result >= right;
      } else if (op === "==") {
        result = result == right;
      } else {
        result = result != right;
      }
      hasComparison = true;
    }

    return hasComparison ? (result ? 1 : 0) : result;
  }

  function parseAndExpr() {
    // Parse logical AND (higher precedence than ||, lower than comparisons)
    let result = parseComparisonExpr();
    let hasAnd = false;

    while (pos < tokens.length && tokens[pos] === "&&") {
      pos++; // consume '&&'
      const right = parseComparisonExpr();
      result = result && right;
      hasAnd = true;
    }

    return hasAnd ? (result ? 1 : 0) : result;
  }

  function parseOrExpr() {
    // Parse logical OR (lowest precedence)
    let result = parseAndExpr();
    let hasOr = false;

    while (pos < tokens.length && tokens[pos] === "||") {
      pos++; // consume '||'
      const right = parseAndExpr();
      result = result || right;
      hasOr = true;
    }

    return hasOr ? (result ? 1 : 0) : result;
  }

  function parseExpr() {
    // Parse addition/subtraction
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
      scopeStack.push({}); // push new block scope
      let lastResult = 0;
      // Parse statements separated by ; until closing }
      while (pos < tokens.length && tokens[pos] !== "}") {
        const val = parseStatement();
        lastResult = val;
      }
      if (pos >= tokens.length || tokens[pos] !== "}")
        throw new Error("Invalid source: " + source);
      pos++; // consume '}'
      scopeStack.pop(); // pop block scope
      return lastResult;
    }

    // Boolean literals
    if (token === "true") {
      pos++;
      return 1;
    }
    if (token === "false") {
      pos++;
      return 0;
    }

    // Variable reference (identifier that's not a keyword)
    if (/^[a-zA-Z_]\w*$/.test(token)) {
      pos++;
      const entry = lookup(token);
      return entry.value;
    }

    if (/^\d+$/.test(token)) {
      pos++;
      return parseInt(token, 10);
    }

    // Should not reach here — all token types are handled above
  }

  function parseStatement() {
    // Parse `let x = expr` or `let mut x = expr` declarations
    if (tokens[pos] === "let") {
      pos++; // consume 'let'
      const mutable = tokens[pos] === "mut";
      if (mutable) pos++; // optionally consume 'mut'
      const name = tokens[pos];
      if (!name || !/^[a-zA-Z_]\w*$/.test(name))
        throw new Error("Invalid source: " + source);
      pos++; // consume variable name
      if (tokens[pos] !== "=") throw new Error("Invalid source: " + source);
      pos++; // consume '='
      const value = parseOrExpr();
      scopeStack[scopeStack.length - 1][name] = { value, mutable };
      if (pos < tokens.length && tokens[pos] === ";") {
        pos++; // consume ';'
      }
      return value;
    }

    // Parse assignment `x = expr` for mutable variables
    if (/^[a-zA-Z_]\w*$/.test(tokens[pos]) && tokens[pos + 1] === "=") {
      const name = tokens[pos];
      pos++; // consume variable name
      pos++; // consume '='
      const value = parseOrExpr();
      assign(name, value);
      if (pos < tokens.length && tokens[pos] === ";") {
        pos++; // consume ';'
      }
      return value;
    }

    // Plain expression — only valid as the last statement without trailing ;
    const result = parseOrExpr();
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
