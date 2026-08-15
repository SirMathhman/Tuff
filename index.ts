export function evaluate(input: string): number {
  if (input === "") return 0;
  const tokens = tokenize(input);
  const scope = new Map();
  const { value, pos } = parseProgram(tokens, 0, scope);
  if (pos !== tokens.length) {
    throw new Error(`Unexpected token: ${tokens[pos]}`);
  }
  return asNumber(value);
}

function parseProgram(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { value: Value; pos: number } {
  let next = pos;
  while (next < tokens.length && isStatementStart(tokens, next)) {
    next = parseStatement(tokens, next, scope).pos;
  }
  return parseComparison(tokens, next, scope);
}

function isStatementStart(tokens: Token[], pos: number): boolean {
  const token = tokens[pos];
  if (token === "let") return true;
  if (token === "*") return isDerefAssignment(tokens, pos);
  if (token === "{") return isBlockStatement(tokens, pos);
  if (
    typeof token === "string" &&
    token !== "let" &&
    token !== "mut" &&
    tokens[pos + 1] === "="
  ) {
    return true;
  }
  return false;
}

function isBlockStatement(tokens: Token[], pos: number): boolean {
  if (tokens[pos] !== "{") return false;
  const close = findMatchingBrace(tokens, pos);
  if (close === -1) return false;
  const after = tokens[close + 1];
  // A block is an expression when it's the operand of an operator or inside parens.
  return (
    after !== "+" &&
    after !== "-" &&
    after !== "*" &&
    after !== "/" &&
    after !== ")"
  );
}

function findMatchingBrace(tokens: Token[], pos: number): number {
  let depth = 0;
  for (let i = pos; i < tokens.length; i++) {
    if (tokens[i] === "{") depth++;
    else if (tokens[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function isDerefAssignment(tokens: Token[], pos: number): boolean {
  if (tokens[pos] !== "*") return false;
  const name = tokens[pos + 1];
  return typeof name === "string" && tokens[pos + 2] === "=";
}

function parseStatement(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { pos: number } {
  if (tokens[pos] === "let") return parseLet(tokens, pos, scope);
  if (tokens[pos] === "*") return parseDerefAssignment(tokens, pos, scope);
  if (tokens[pos] === "{") return parseBlockStatement(tokens, pos, scope);
  return parseAssignment(tokens, pos, scope);
}

function parseBlockStatement(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { pos: number } {
  const blockScope = new Map(scope);
  let next = pos + 1; // skip '{'
  while (next < tokens.length && isStatementStart(tokens, next)) {
    next = parseStatement(tokens, next, blockScope).pos;
  }
  if (tokens[next] !== "}") throw new Error("Expected '}'");
  return { pos: next + 1 };
}

function parseDerefAssignment(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { pos: number } {
  const { value, pos: afterLhs } = parseFactor(tokens, pos + 1, scope);
  if (typeof value !== "object")
    throw new Error("Expected a reference to assign through");
  const varInfo = requireMutable(scope, value.ref);
  const { value: newValue, pos: afterExpr } = parseEqualsExpr(
    tokens,
    afterLhs,
    scope,
  );
  varInfo.value = newValue;
  return { pos: afterExpr };
}

function requireMutable(scope: Scope, name: string): Var {
  const varInfo = scope.get(name);
  if (!varInfo) throw new Error(`Undefined variable: ${name}`);
  if (!varInfo.mutable)
    throw new Error(`Cannot assign to immutable variable: ${name}`);
  return varInfo;
}

function parseLet(tokens: Token[], pos: number, scope: Scope): { pos: number } {
  let next = pos + 1; // skip 'let'
  let mutable = false;
  if (tokens[next] === "mut") {
    mutable = true;
    next++; // skip 'mut'
  }
  const name = tokens[next];
  if (typeof name !== "string")
    throw new Error("Expected variable name after 'let'");
  next++; // skip name
  const { value, pos: afterExpr } = parseEqualsExpr(tokens, next, scope);
  scope.set(name, { value, mutable });
  return { pos: afterExpr };
}

function parseAssignment(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { pos: number } {
  const name = tokens[pos];
  if (typeof name !== "string")
    throw new Error(`Expected variable name, got '${name}'`);
  const varInfo = requireMutable(scope, name);
  const { value, pos: afterExpr } = parseEqualsExpr(tokens, pos + 1, scope);
  varInfo.value = value;
  return { pos: afterExpr };
}

function parseEqualsExpr(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { value: Value; pos: number } {
  if (tokens[pos] !== "=") throw new Error("Expected '='");
  const { value, pos: afterExpr } = parseComparison(tokens, pos + 1, scope);
  let next = afterExpr;
  if (tokens[next] === ";") next++; // skip ';'
  return { value, pos: next };
}

type Token = number | string;
type Scalar = number | boolean;
type Value = Scalar | { ref: string; mutable: boolean };
type Var = { value: Value; mutable: boolean };
type Scope = Map<string, Var>;

function dereference(scope: Scope, value: Value): Scalar {
  let current = value;
  while (typeof current === "object") {
    const target = scope.get(current.ref);
    if (!target) throw new Error(`Undefined variable: ${current.ref}`);
    current = target.value;
  }
  return current;
}

function asNumber(value: Value): number {
  if (typeof value === "object")
    throw new Error(`Expected number, got reference to '${value.ref}'`);
  return typeof value === "boolean" ? (value ? 1 : 0) : value;
}

function valuesEqual(scope: Scope, a: Value, b: Value): boolean {
  const left = dereference(scope, a);
  const right = dereference(scope, b);
  if (typeof left === "boolean" || typeof right === "boolean") {
    return (
      typeof left === "boolean" && typeof right === "boolean" && left === right
    );
  }
  return left === right;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < input.length && /[0-9.]/.test(input[i]!)) {
        num += input[i]!;
        i++;
      }
      const value = Number(num);
      if (Number.isNaN(value)) throw new Error(`Invalid number: ${num}`);
      tokens.push(value);
    } else if (ch === "=" && input[i + 1] === "=") {
      tokens.push("==" as Token);
      i += 2;
    } else if ("+-*/(){}=;&".includes(ch)) {
      tokens.push(ch as Token);
      i++;
    } else if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i]!)) {
        ident += input[i]!;
        i++;
      }
      tokens.push(ident as Token);
    } else {
      throw new Error(`Unexpected character: ${ch}`);
    }
  }
  return tokens;
}

function parseComparison(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { value: Value; pos: number } {
  let { value, pos: next } = parseExpression(tokens, pos, scope);
  while (next < tokens.length && tokens[next] === "==") {
    const rhs = parseExpression(tokens, next + 1, scope);
    value = valuesEqual(scope, value, rhs.value) ? 1 : 0;
    next = rhs.pos;
  }
  return { value, pos: next };
}

function parseExpression(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { value: Value; pos: number } {
  let { value, pos: next } = parseTerm(tokens, pos, scope);
  while (
    next < tokens.length &&
    (tokens[next] === "+" || tokens[next] === "-")
  ) {
    const op = tokens[next] as "+" | "-";
    const rhs = parseTerm(tokens, next + 1, scope);
    value =
      op === "+"
        ? asNumber(value) + asNumber(rhs.value)
        : asNumber(value) - asNumber(rhs.value);
    next = rhs.pos;
  }
  return { value, pos: next };
}

function parseTerm(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { value: Value; pos: number } {
  let { value, pos: next } = parseFactor(tokens, pos, scope);
  while (
    next < tokens.length &&
    (tokens[next] === "*" || tokens[next] === "/")
  ) {
    const op = tokens[next] as "*" | "/";
    const rhs = parseFactor(tokens, next + 1, scope);
    value =
      op === "*"
        ? asNumber(value) * asNumber(rhs.value)
        : asNumber(value) / asNumber(rhs.value);
    next = rhs.pos;
  }
  return { value, pos: next };
}

function parseFactor(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { value: Value; pos: number } {
  const token = tokens[pos];
  if (token === undefined) throw new Error("Unexpected end of input");
  if (token === "+") return parseFactor(tokens, pos + 1, scope);
  if (token === "-") {
    const { value, pos: next } = parseFactor(tokens, pos + 1, scope);
    return { value: -asNumber(value), pos: next };
  }
  if (token === "*") {
    const { value, pos: next } = parseFactor(tokens, pos + 1, scope);
    return { value: dereference(scope, value), pos: next };
  }
  if (token === "&") {
    let next = pos + 1;
    let mutable = false;
    if (tokens[next] === "mut") {
      mutable = true;
      next++; // skip 'mut'
    }
    const name = tokens[next];
    if (typeof name !== "string" || !scope.has(name))
      throw new Error(`Undefined variable: ${name}`);
    return { value: { ref: name, mutable }, pos: next + 1 };
  }
  if (token === "(") {
    const { value, pos: next } = parseComparison(tokens, pos + 1, scope);
    if (tokens[next] !== ")") throw new Error("Expected ')'");
    return { value, pos: next + 1 };
  }
  if (token === "{") {
    return parseBlock(tokens, pos, scope);
  }
  if (token === "true") return { value: true, pos: pos + 1 };
  if (token === "false") return { value: false, pos: pos + 1 };
  if (typeof token === "number") return { value: token, pos: pos + 1 };
  if (typeof token === "string" && token !== "let" && token !== "mut") {
    const varInfo = scope.get(token);
    if (!varInfo) throw new Error(`Undefined variable: ${token}`);
    return { value: varInfo.value, pos: pos + 1 };
  }
  throw new Error(`Unexpected token: ${token}`);
}

function parseBlock(
  tokens: Token[],
  pos: number,
  parentScope: Scope,
): { value: Value; pos: number } {
  const scope = new Map(parentScope);
  let next = pos + 1; // skip '{'
  while (next < tokens.length && isStatementStart(tokens, next)) {
    next = parseStatement(tokens, next, scope).pos;
  }
  const { value, pos: afterFinal } = parseExpression(tokens, next, scope);
  if (tokens[afterFinal] !== "}") throw new Error("Expected '}'");
  return { value, pos: afterFinal + 1 };
}
