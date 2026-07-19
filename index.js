export function evaluate(source, scope) {
  if (source.trim() === "") return 0;

  const tokens = source.trim().replace(/([()+*/{};=-])/g, " $1 ").trim().split(/\s+/);
  let i = 0;
  const vars = scope || {};
  const mutVars = new Set();

  function parseExpr() {
    let left = parseTerm();
    while (i < tokens.length && (tokens[i] === "+" || tokens[i] === "-")) {
      const op = tokens[i++];
      left = op === "+" ? left + parseTerm() : left - parseTerm();
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    while (i < tokens.length && (tokens[i] === "*" || tokens[i] === "/")) {
      const op = tokens[i++];
      left = op === "*" ? left * parseFactor() : left / parseFactor();
    }
    return left;
  }

  function parseParenExpr() {
    i++; // skip "("
    const value = parseExpr();
    if (tokens[i] !== ")") {
      throw new Error("Missing closing parenthesis");
    }
    i++;
    return value;
  }

  function parseBlock() {
    i++; // skip "{"
    let lastValue = 0;
    while (i < tokens.length && tokens[i] !== "}") {
      lastValue = parseStatement();
    }
    if (tokens[i] !== "}") {
      throw new Error("Missing closing brace");
    }
    i++;
    return lastValue;
  }

  function parseFactor() {
    const token = tokens[i];
    if (token === "(") return parseParenExpr();
    if (token === "{") return parseBlock();
    if (token && /^[a-zA-Z_]\w*$/.test(token)) {
      if (token in vars) {
        i++;
        return vars[token];
      }
      throw new Error(`Undefined identifier: ${token}`);
    }
    i++;
    const value = Number(token);
    if (isNaN(value)) {
      throw new Error(`Unexpected token: ${token}`);
    }
    return value;
  }

  function parseLetDeclaration() {
    i++; // skip "let"
    const isMut = tokens[i] === "mut";
    if (isMut) i++; // skip "mut"
    const name = tokens[i++];
    if (tokens[i] !== "=") {
      throw new Error("Expected '=' after variable name");
    }
    i++; // skip "="
    vars[name] = parseExpr();
    if (isMut) mutVars.add(name);
    if (tokens[i] === ";") i++; // skip ";"
    return vars[name];
  }

  function parseAssignment() {
    const name = tokens[i++];
    if (!mutVars.has(name)) {
      throw new Error(`Cannot assign to immutable variable: ${name}`);
    }
    i++; // skip "="
    vars[name] = parseExpr();
    if (tokens[i] === ";") i++; // skip ";"
    return vars[name];
  }

  function parseStatement() {
    if (tokens[i] === "let") return parseLetDeclaration();
    if (tokens[i] && /^[a-zA-Z_]\w*$/.test(tokens[i]) && tokens[i] in vars && tokens[i + 1] === "=") {
      return parseAssignment();
    }
    const value = parseExpr();
    if (tokens[i] === ";") i++; // skip ";"
    return value;
  }

  let result = 0;
  while (i < tokens.length) {
    result = parseStatement();
  }
  return result;
}