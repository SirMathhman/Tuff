export function evaluate(source, scope) {
  if (source.trim() === "") return 0;

  const tokens = source.trim().replace(/(&&|\|\||[<>=]|[()+*/{};=|&-])/g, " $1 ").trim().split(/\s+/);
  let i = 0;
  const scopeStack = [{ vars: scope || {}, mutVars: new Set() }];

  function enterScope() {
    scopeStack.push({ vars: {}, mutVars: new Set() });
  }

  function exitScope() {
    scopeStack.pop();
  }

  function lookup(name) {
    for (let s = scopeStack.length - 1; s >= 0; s--) {
      if (name in scopeStack[s].vars) return scopeStack[s].vars[name];
    }
    return undefined;
  }

  function isMutable(name) {
    for (let s = scopeStack.length - 1; s >= 0; s--) {
      if (name in scopeStack[s].vars) return scopeStack[s].mutVars.has(name);
    }
    return false;
  }

  function findAndSet(name, value) {
    for (let s = scopeStack.length - 1; s >= 0; s--) {
      if (name in scopeStack[s].vars) {
        scopeStack[s].vars[name] = value;
        return;
      }
    }
  }

  function parseOrExpr() {
    let left = parseAndExpr();
    while (i < tokens.length && tokens[i] === "||") {
      i++;
      left = left || parseAndExpr();
    }
    return left;
  }

  function isComparisonOp(op) {
    return ["<", ">", "<=", ">=", "==", "!="].includes(op);
  }

  const comparators = {
    "<": (a, b) => a < b,
    ">": (a, b) => a > b,
    "<=": (a, b) => a <= b,
    ">=": (a, b) => a >= b,
    "==": (a, b) => a === b,
    "!=": (a, b) => a !== b,
  };

  function compare(left, op, right) {
    return comparators[op](left, right) ? 1 : 0;
  }

  function parseComparison() {
    let left = parseExpr();
    while (i < tokens.length && isComparisonOp(tokens[i])) {
      const op = tokens[i++];
      const right = parseExpr();
      left = compare(left, op, right);
    }
    return left;
  }

  function parseAndExpr() {
    let left = parseComparison();
    while (i < tokens.length && tokens[i] === "&&") {
      i++;
      left = left && parseComparison();
    }
    return left;
  }

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
    const value = parseOrExpr();
    if (tokens[i] !== ")") {
      throw new Error("Missing closing parenthesis");
    }
    i++;
    return value;
  }

  function parseBlock() {
    i++; // skip "{"
    enterScope();
    let lastValue = 0;
    while (i < tokens.length && tokens[i] !== "}") {
      lastValue = parseStatement();
    }
    if (tokens[i] !== "}") {
      throw new Error("Missing closing brace");
    }
    i++;
    exitScope();
    return lastValue;
  }

  function parseFactor() {
    const token = tokens[i];
    if (token === "(") return parseParenExpr();
    if (token === "{") return parseBlock();
    if (token === "true") { i++; return 1; }
    if (token === "false") { i++; return 0; }
    if (token && /^[a-zA-Z_]\w*$/.test(token)) {
      const val = lookup(token);
      if (val !== undefined) {
        i++;
        return val;
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
    scopeStack[scopeStack.length - 1].vars[name] = parseOrExpr();
    if (isMut) scopeStack[scopeStack.length - 1].mutVars.add(name);
    if (tokens[i] === ";") i++; // skip ";"
    return scopeStack[scopeStack.length - 1].vars[name];
  }

  function parseAssignment() {
    const name = tokens[i++];
    if (!isMutable(name)) {
      throw new Error(`Cannot assign to immutable variable: ${name}`);
    }
    i++; // skip "="
    const value = parseOrExpr();
    findAndSet(name, value);
    if (tokens[i] === ";") i++; // skip ";"
    return value;
  }

  function parseStatement() {
    if (tokens[i] === "let") return parseLetDeclaration();
    if (tokens[i] && /^[a-zA-Z_]\w*$/.test(tokens[i]) && lookup(tokens[i]) !== undefined && tokens[i + 1] === "=") {
      return parseAssignment();
    }
    const value = parseOrExpr();
    if (tokens[i] === ";") i++; // skip ";"
    return value;
  }

  let result = 0;
  while (i < tokens.length) {
    result = parseStatement();
  }
  return result;
}