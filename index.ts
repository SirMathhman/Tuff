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
  while (next < tokens.length && tokens[next] === "let") {
    next = parseLet(tokens, next, scope).pos;
  }
  return parseExpression(tokens, next, scope);
}

function parseLet(
  tokens: Token[],
  pos: number,
  scope: Scope,
): { pos: number } {
  let next = pos + 1; // skip 'let'
  const name = tokens[next];
  if (typeof name !== "string")
    throw new Error("Expected variable name after 'let'");
  next++; // skip name
  if (tokens[next] !== "=") throw new Error(`Expected '=' after '${name}'`);
  next++; // skip '='
  const { value, pos: afterExpr } = parseExpression(tokens, next, scope);
  scope.set(name, value);
  next = afterExpr;
  if (tokens[next] === ";") next++; // skip ';'
  return { pos: next };
}

type Token = number | string;
type Scope = Map<string, number>;

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
  if (typeof token === "string" && token !== "let") {
    if (!scope.has(token)) throw new Error(`Undefined variable: ${token}`);
    return { value: scope.get(token)!, pos: pos + 1 };
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
  while (next < tokens.length && tokens[next] === "let") {
    next = parseLet(tokens, next, scope).pos;
  }
  const { value, pos: afterFinal } = parseExpression(tokens, next, scope);
  if (tokens[afterFinal] !== "}") throw new Error("Expected '}'");
  return { value, pos: afterFinal + 1 };
}
