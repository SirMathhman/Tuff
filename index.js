export function evaluate(source, scope) {
  if (source.trim() === "") return 0;

  let tokens = source.trim().replace(/(&&|\|\||\+=|=>|[<>=]|[()+*/{};=|&:-])/g, " $1 ").trim().split(/\s+/);
  const keywords = new Set(["let", "mut", "if", "else", "while", "fn", "true", "false"]);
  const typeRanges = {
    U8: [0, 255], U16: [0, 65535], U32: [0, 4294967295],
    I8: [-128, 127], I16: [-32768, 32767], I32: [-2147483648, 2147483647],
  };

  class TypedValue {
    constructor(value, type) {
      this.value = value;
      this.type = type;
    }
  }

  function validateTypeRange(value, type) {
    const range = typeRanges[type];
    if (range && (value < range[0] || value > range[1])) throw new Error(`Value ${value} out of range for ${type}`);
  }

  function checkType(expectedType, actual) {
    if (actual instanceof TypedValue && actual.type && actual.type !== expectedType) {
      throw new Error(`Type mismatch: expected ${expectedType} but got ${actual.type}`);
    }
  }

  function unwrap(val) {
    return val instanceof TypedValue ? val.value : val;
  }
  let i = 0;
  let scopeStack = [{ vars: scope || {}, mutVars: new Set() }];

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
      left = unwrap(left) ? left : parseAndExpr();
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
    return comparators[op](unwrap(left), unwrap(right)) ? 1 : 0;
  }

  function parseComparison() {
    let left = parseExpr();
    while (i < tokens.length && isComparisonOp(tokens[i])) {
      const op = tokens[i++];
      const right = parseExpr();
      left = compare(unwrap(left), op, unwrap(right));
    }
    return left;
  }

  function parseAndExpr() {
    let left = parseComparison();
    while (i < tokens.length && tokens[i] === "&&") {
      i++;
      left = unwrap(left) ? parseComparison() : left;
    }
    return left;
  }

  function parseExpr() {
    let left = parseTerm();
    while (i < tokens.length && (tokens[i] === "+" || tokens[i] === "-")) {
      const op = tokens[i++];
      left = op === "+" ? unwrap(left) + unwrap(parseTerm()) : unwrap(left) - unwrap(parseTerm());
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    while (i < tokens.length && (tokens[i] === "*" || tokens[i] === "/")) {
      const op = tokens[i++];
      left = op === "*" ? unwrap(left) * unwrap(parseFactor()) : unwrap(left) / unwrap(parseFactor());
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

  function parseIfCondition() {
    if (tokens[i] !== "(") throw new Error("Expected '(' after 'if'");
    i++; // skip "("
    const condition = parseOrExpr();
    if (tokens[i] !== ")") throw new Error("Expected ')' after condition");
    i++; // skip ")"
    return condition;
  }

  function parseIfExpr() {
    i++; // skip "if"
    const condition = unwrap(parseIfCondition());
    const thenValue = unwrap(parseOrExpr());
    if (tokens[i] !== "else") throw new Error("Expected 'else'");
    i++; // skip "else"
    const elseValue = unwrap(parseOrExpr());
    return condition ? thenValue : elseValue;
  }

  function parseIdentifier() {
    const token = tokens[i];
    const val = lookup(token);
    if (val !== undefined) {
      i++;
      return val;
    }
    throw new Error(`Undefined identifier: ${token}`);
  }

  function parseNumber() {
    i++;
    const raw = tokens[i - 1];
    const match = raw.match(/^(\d+)(U8|U16|U32|I8|I16|I32)?$/);
    if (!match) throw new Error(`Unexpected token: ${raw}`);
    const value = Number(match[1]);
    if (isNaN(value)) throw new Error(`Unexpected token: ${raw}`);
    const type = match[2];
    if (type) validateTypeRange(value, type);
    return type ? new TypedValue(value, type) : value;
  }

  function parseFactor() {
    const token = tokens[i];
    if (token === "(") return parseParenExpr();
    if (token === "{") return parseBlock();
    if (token === "if") return parseIfExpr();
    if (token === "true") { i++; return 1; }
    if (token === "false") { i++; return 0; }
    if (token && /^[a-zA-Z_]\w*$/.test(token) && !keywords.has(token)) return parseIdentifierOrCall();
    return parseNumber();
  }

  function parseIdentifierOrCall() {
    const token = tokens[i];
    const val = lookup(token);
    if (val !== undefined && tokens[i + 1] === "(") return callFunction(token);
    return parseIdentifier();
  }

  function callFunction(name) {
    i++; // skip identifier
    i++; // skip "("
    const arg = tokens[i] === ")" ? undefined : parseOrExpr();
    if (tokens[i] !== ")") throw new Error("Missing closing parenthesis");
    i++;
    const fn = lookup(name);
    if (!fn || !fn.isFn) throw new Error(`Not a function: ${name}`);
    const fnScope = { ...fn.scope };
    if (arg !== undefined) fnScope.arg = arg;
    return evaluate(fn.body, fnScope);
  }

  function parseLetDeclaration() {
    i++; // skip "let"
    const isMut = tokens[i] === "mut";
    if (isMut) i++; // skip "mut"
    const name = tokens[i++];
    let type = undefined;
    if (tokens[i] === ":") {
      i++; // skip ":"
      type = tokens[i++];
    }
    if (tokens[i] !== "=") {
      throw new Error("Expected '=' after variable name");
    }
    i++; // skip "="
    const value = parseOrExpr();
    if (type) {
      checkType(type, value);
      const numValue = value instanceof TypedValue ? value.value : value;
      validateTypeRange(numValue, type);
    }
    scopeStack[scopeStack.length - 1].vars[name] = value;
    if (isMut) scopeStack[scopeStack.length - 1].mutVars.add(name);
    if (tokens[i] === ";") i++; // skip ";"
    return 0;
  }

  function parseAssignment() {
    const name = tokens[i++];
    if (!isMutable(name)) {
      throw new Error(`Cannot assign to immutable variable: ${name}`);
    }
    const op = tokens[i];
    i++; // skip operator
    const value = parseOrExpr();
    if (op === "+=") {
      const current = unwrap(lookup(name));
      findAndSet(name, current + unwrap(value));
      if (tokens[i] === ";") i++; // skip ";"
      return current + unwrap(value);
    }
    findAndSet(name, value);
    if (tokens[i] === ";") i++; // skip ";"
    return value;
  }

  function skipStatement() {
    let depth = 0;
    while (i < tokens.length) {
      if (tokens[i] === "{") { depth++; i++; }
      else if (tokens[i] === "}") {
        if (depth === 0) { i++; return; }
        depth--;
        i++;
        if (depth === 0) return;
      } else if (tokens[i] === ";" && depth === 0) {
        i++;
        return;
      } else {
        i++;
      }
    }
  }

  function isAssignment() {
    return tokens[i] && /^[a-zA-Z_]\w*$/.test(tokens[i]) && !keywords.has(tokens[i]) && lookup(tokens[i]) !== undefined && (tokens[i + 1] === "=" || tokens[i + 1] === "+=");
  }

  function parseStatement() {
    if (tokens[i] === "let") return parseLetDeclaration();
    if (tokens[i] === "if") return parseIfStatement();
    if (tokens[i] === "while") return parseWhileStatement();
    if (tokens[i] === "fn") return parseFnDeclaration();
    if (isAssignment()) return parseAssignment();
    const value = parseOrExpr();
    if (tokens[i] === ";") i++; // skip ";"
    return value;
  }

  function parseFnDeclaration() {
    i++; // skip "fn"
    const name = tokens[i++];
    if (tokens[i] !== "(") throw new Error("Expected '(' after function name");
    i++; // skip "("
    if (tokens[i] !== ")") throw new Error("Expected ')' for empty params");
    i++; // skip ")"
    if (tokens[i] !== "=>") throw new Error("Expected '=>' after parameters");
    i++; // skip "=>"
    const bodyStart = i;
    const bodyValue = parseOrExpr();
    const bodyEnd = i;
    const bodySource = tokens.slice(bodyStart, bodyEnd).join(" ");
    scopeStack[scopeStack.length - 1].vars[name] = { isFn: true, body: bodySource, scope: { ...scopeStack[scopeStack.length - 1].vars } };
    if (tokens[i] === ";") i++;
    return bodyValue;
  }

  function parseIfStatement() {
    i++; // skip "if"
    const condition = unwrap(parseIfCondition());
    if (condition) {
      const thenValue = parseStatement();
      if (tokens[i] === "else") {
        i++; // skip "else"
        skipStatement();
        return thenValue;
      }
      return thenValue;
    }
    skipStatement();
    if (tokens[i] === "else") {
      i++; // skip "else"
      return parseStatement();
    }
    return 0;
  }

  function parseWhileStatement() {
    i++; // skip "while"
    if (tokens[i] !== "(") throw new Error("Expected '(' after 'while'");
    i++; // skip "("
    const condStart = i;
    let condition = unwrap(parseOrExpr());
    if (tokens[i] !== ")") throw new Error("Expected ')' after condition");
    i++; // skip ")"
    const bodyStart = i;
    let bodyEnd = bodyStart;
    while (condition) {
      i = bodyStart;
      parseStatement();
      bodyEnd = i;
      i = condStart;
      condition = unwrap(parseOrExpr());
    }
    i = bodyEnd;
    return 0;
  }

  let result = 0;
  while (i < tokens.length) {
    result = parseStatement();
  }
  return unwrap(result);
}