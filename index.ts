export function evaluate(input: string): number {
  if (input === "") return 0;
  const tokens = tokenize(input);
  const { value, pos } = parseProgram(tokens, 0, new Map());
  if (pos !== tokens.length) {
    throw new Error(`Unexpected token: ${tokens[pos]}`);
  }
  return value;
}

function parseProgram(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { value: number; pos: number } {
  let next = pos;
  while (next < tokens.length && isStatementStart(tokens, next)) {
    next = parseStatement(tokens, next, scope).pos;
  }
  return parseExpression(tokens, next, scope);
}

function isStatementStart(tokens: Token[], pos: number): boolean {
  const token = tokens[pos];
  if (token === "let") return true;
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

function parseStatement(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { pos: number } {
  if (tokens[pos] === "let") return parseLet(tokens, pos, scope);
  return parseAssignment(tokens, pos, scope);
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
  const varInfo = scope.get(name);
  if (!varInfo) throw new Error(`Undefined variable: ${name}`);
  if (!varInfo.mutable)
    throw new Error(`Cannot assign to immutable variable: ${name}`);
  const { value, pos: afterExpr } = parseEqualsExpr(tokens, pos + 1, scope);
  varInfo.value = value;
  return { pos: afterExpr };
}

function parseEqualsExpr(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { value: number; pos: number } {
  if (tokens[pos] !== "=") throw new Error("Expected '='");
  const { value, pos: afterExpr } = parseExpression(tokens, pos + 1, scope);
  let next = afterExpr;
  if (tokens[next] === ";") next++; // skip ';'
  return { value, pos: next };
}

type Token = number | string;
type Var = { value: number; mutable: boolean };
type Scope = Map<string, Var>;

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
    } else if ("+-*/(){}=;".includes(ch)) {
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

function parseExpression(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { value: number; pos: number } {
  let { value, pos: next } = parseTerm(tokens, pos, scope);
  while (
    next < tokens.length &&
    (tokens[next] === "+" || tokens[next] === "-")
  ) {
    const op = tokens[next] as "+" | "-";
    const rhs = parseTerm(tokens, next + 1, scope);
    value = op === "+" ? value + rhs.value : value - rhs.value;
    next = rhs.pos;
  }
  return { value, pos: next };
}

function parseTerm(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { value: number; pos: number } {
  let { value, pos: next } = parseFactor(tokens, pos, scope);
  while (
    next < tokens.length &&
    (tokens[next] === "*" || tokens[next] === "/")
  ) {
    const op = tokens[next] as "*" | "/";
    const rhs = parseFactor(tokens, next + 1, scope);
    value = op === "*" ? value * rhs.value : value / rhs.value;
    next = rhs.pos;
  }
  return { value, pos: next };
}

function parseFactor(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { value: number; pos: number } {
  const token = tokens[pos];
  if (token === undefined) throw new Error("Unexpected end of input");
  if (token === "+") return parseFactor(tokens, pos + 1, scope);
  if (token === "-") {
    const { value, pos: next } = parseFactor(tokens, pos + 1, scope);
    return { value: -value, pos: next };
  }
  if (token === "(") {
    const { value, pos: next } = parseExpression(tokens, pos + 1, scope);
    if (tokens[next] !== ")") throw new Error("Expected ')'");
    return { value, pos: next + 1 };
  }
  if (token === "{") {
    return parseBlock(tokens, pos, scope);
  }
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
): { value: number; pos: number } {
  const scope = new Map(parentScope);
  let next = pos + 1; // skip '{'
  while (next < tokens.length && isStatementStart(tokens, next)) {
    next = parseStatement(tokens, next, scope).pos;
  }
  const { value, pos: afterFinal } = parseExpression(tokens, next, scope);
  if (tokens[afterFinal] !== "}") throw new Error("Expected '}'");
  return { value, pos: afterFinal + 1 };
}
