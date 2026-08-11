export function evaluate(source: string): number {
  if (source === "") return 0;

  const tokens = tokenize(source);
  const parser = { pos: 0 };
  const env = new Environment();
  const result = parseProgram(parser, tokens, env);

  if (parser.pos < tokens.length) {
    throw new Error("Invalid source: " + source);
  }
  return result;
}

class Environment {
  private values: Record<string, number | Ref> = {};
  private mutable: Set<string> = new Set();
  private parent: Environment | undefined;

  constructor(parent?: Environment) {
    this.parent = parent;
  }

  declare(name: string, value: number | Ref, mutable = false): void {
    this.values[name] = value;
    if (mutable) this.mutable.add(name);
  }

  assign(name: string, value: number | Ref): void {
    if (!this.mutable.has(name)) {
      if (this.parent) {
        this.parent.assign(name, value);
        return;
      }
      throw new Error("Cannot assign to immutable variable: " + name);
    }
    this.values[name] = value;
  }

  get(name: string): number | Ref | undefined {
    if (Object.prototype.hasOwnProperty.call(this.values, name)) {
      return this.values[name];
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    return undefined;
  }

  isMutable(name: string): boolean {
    if (this.mutable.has(name)) return true;
    if (this.parent) return this.parent.isMutable(name);
    return false;
  }
}

type Ref = { name: string; env: Environment; mutable: boolean };

function deref(ref: Ref): number {
  const val = ref.env.get(ref.name);
  if (val === undefined) throw new Error("Reference to undefined variable");
  if (typeof val === "object") return deref(val);
  return val;
}

function assignRef(ref: Ref, value: number): void {
  if (!ref.mutable)
    throw new Error("Cannot assign through immutable reference");
  ref.env.assign(ref.name, value);
}

type Token =
  | ["num", number]
  | ["op", "+" | "-" | "*" | "/"]
  | ["group", "(" | ")" | "{" | "}"]
  | ["kw", "let"]
  | ["id", string]
  | ["assign", "="]
  | ["semi", ";"]
  | ["ref", "&"]
  | ["str", string];

function tokenize(source: string): Token[] {
  const result: Token[] = [];
  const re = /"([^"]*)"|(\d+\.?\d*|[+\-*/(){}=;&]|[a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const [text, strContent] = match;
    if (text === " " || text === "") continue;
    if (strContent !== undefined) {
      result.push(["str", strContent]);
      continue;
    }
    if (text === "+" || text === "-" || text === "*" || text === "/") {
      result.push(["op", text as "+" | "-" | "*" | "/"]);
    } else if (text === "&") {
      result.push(["ref", "&"]);
    } else if (text === "(" || text === ")" || text === "{" || text === "}") {
      result.push(["group", text as "(" | ")" | "{" | "}"]);
    } else if (text === "=") {
      result.push(["assign", "="]);
    } else if (text === ";") {
      result.push(["semi", ";"]);
    } else if (text === "let") {
      result.push(["kw", "let"]);
    } else if (/^[a-zA-Z_]/.test(text)) {
      result.push(["id", text]);
    } else {
      result.push(["num", Number(text)]);
    }
  }
  return result;
}

function parseProgram(
  p: { pos: number },
  tokens: Token[],
  env: Environment,
): number {
  let last = 0;
  while (p.pos < tokens.length) {
    if (tokens[p.pos]![0] === "kw" && tokens[p.pos]![1] === "let") {
      last = parseLet(p, tokens, env);
    } else if (
      tokens[p.pos]![0] === "op" &&
      tokens[p.pos]![1] === "*" &&
      p.pos + 2 < tokens.length &&
      tokens[p.pos + 2]![0] === "assign"
    ) {
      // *y = value ;
      last = parseDerefAssignment(p, tokens, env);
    } else if (
      tokens[p.pos]![0] === "id" &&
      p.pos + 1 < tokens.length &&
      tokens[p.pos + 1]![0] === "assign"
    ) {
      last = parseAssignment(p, tokens, env);
    } else {
      last = parseAddSub(p, tokens, env);
      if (p.pos < tokens.length && tokens[p.pos]![0] === "semi") p.pos++;
    }
  }
  return last;
}

function parseLet(
  p: { pos: number },
  tokens: Token[],
  env: Environment,
): number {
  p.pos++; // consume "let"
  const isMut = tokens[p.pos]![0] === "id" && tokens[p.pos]![1] === "mut";
  if (isMut) p.pos++; // consume "mut"
  const idToken = tokens[p.pos];
  if (!idToken || idToken[0] !== "id") throw new Error("Expected identifier");
  const name = idToken[1];
  p.pos++; // consume id
  if (tokens[p.pos]![0] !== "assign") throw new Error("Expected =");
  p.pos++; // consume "="
  const value = parseAddSub(p, tokens, env);
  env.declare(name, value, isMut);
  if (p.pos < tokens.length && tokens[p.pos]![0] === "semi") p.pos++;
  return 0;
}

function parseAssignment(
  p: { pos: number },
  tokens: Token[],
  env: Environment,
): number {
  const name = String(tokens[p.pos]![1]);
  p.pos++; // consume id
  p.pos++; // consume "="
  const value = parseAddSub(p, tokens, env);
  env.assign(name, value);
  if (p.pos < tokens.length && tokens[p.pos]![0] === "semi") p.pos++;
  return value;
}

function parseDerefAssignment(
  p: { pos: number },
  tokens: Token[],
  env: Environment,
): number {
  // *y = value ;
  p.pos++; // consume *
  const idToken = tokens[p.pos];
  if (!idToken || idToken[0] !== "id")
    throw new Error("Expected identifier after *");
  p.pos++; // consume id
  p.pos++; // consume "="
  const value = parseAddSub(p, tokens, env);
  const ref = env.get(idToken[1]);
  if (ref === undefined) throw new Error("Undefined variable: " + idToken[1]);
  if (typeof ref === "object") {
    assignRef(ref, value);
  } else {
    throw new Error("Cannot dereference non-reference");
  }
  if (p.pos < tokens.length && tokens[p.pos]![0] === "semi") p.pos++;
  return value;
}

function parseAddSub(
  p: { pos: number },
  tokens: Token[],
  env: Environment,
): number {
  let left = parseMulDiv(p, tokens, env);
  while (
    p.pos < tokens.length &&
    tokens[p.pos]![0] === "op" &&
    (tokens[p.pos]![1] === "+" || tokens[p.pos]![1] === "-")
  ) {
    const op = tokens[p.pos]![1];
    p.pos++;
    const right = parseMulDiv(p, tokens, env);
    left = op === "+" ? left + right : left - right;
  }
  return left;
}

function parseMulDiv(
  p: { pos: number },
  tokens: Token[],
  env: Environment,
): number {
  let left = parseFactor(p, tokens, env);
  while (
    p.pos < tokens.length &&
    tokens[p.pos]![0] === "op" &&
    (tokens[p.pos]![1] === "*" || tokens[p.pos]![1] === "/")
  ) {
    if (tokens[p.pos]![1] === "*") {
      const next = tokens[p.pos + 1];
      if (next && next[0] === "id") break;
    }
    const op = tokens[p.pos]![1];
    p.pos++;
    const right = parseFactor(p, tokens, env);
    left = op === "*" ? left * right : left / right;
  }
  return left;
}

function parseFactor(
  p: { pos: number },
  tokens: Token[],
  env: Environment,
): number {
  const token = tokens[p.pos];
  if (!token) throw new Error("Unexpected end");

  // &x or &mut x — address-of
  if (token[0] === "ref") {
    p.pos++;
    const next = tokens[p.pos];
    const isMut = next && next[0] === "id" && next[1] === "mut";
    if (isMut) p.pos++; // consume "mut"
    const idToken = tokens[p.pos];
    if (!idToken || idToken[0] !== "id")
      throw new Error("Expected identifier after &");
    const name = idToken[1];
    p.pos++;
    return { name, env, mutable: isMut } as any;
  }

  // *y — dereference
  if (token[0] === "op" && token[1] === "*") {
    const next = tokens[p.pos + 1];
    if (next && next[0] === "id") {
      p.pos++; // consume *
      p.pos++; // consume id
      const value = env.get(next[1]);
      if (value === undefined)
        throw new Error("Undefined variable: " + next[1]);
      if (typeof value === "object") return deref(value);
      throw new Error("Cannot dereference non-reference");
    }
  }

  if (token[0] === "group" && token[1] === "(") {
    p.pos++;
    const expr = parseAddSub(p, tokens, env);
    if (tokens[p.pos]![0] !== "group" || tokens[p.pos]![1] !== ")") {
      throw new Error("Expected )");
    }
    p.pos++;
    return expr;
  }
  if (token[0] === "group" && token[1] === "{") {
    p.pos++;
    const blockEnv = new Environment(env);
    let last = 0;
    let found = false;
    let hasValue = false;
    while (
      p.pos < tokens.length &&
      tokens[p.pos]![0] !== "group" &&
      tokens[p.pos]![1] !== "}"
    ) {
      found = true;
      if (tokens[p.pos]![0] === "kw" && tokens[p.pos]![1] === "let") {
        parseLet(p, tokens, blockEnv);
        hasValue = false;
      } else {
        last = parseAddSub(p, tokens, blockEnv);
        hasValue = true;
        if (p.pos < tokens.length && tokens[p.pos]![0] === "semi") p.pos++;
      }
    }
    if (!found) throw new Error("Empty block");
    if (!hasValue) throw new Error("Block has no value");
    if (tokens[p.pos]![0] !== "group" || tokens[p.pos]![1] !== "}") {
      throw new Error("Expected }");
    }
    p.pos++;
    return last;
  }
  return parseNumber(p, tokens, env);
}

type StrToken =
  | ["num", number]
  | ["bool", boolean]
  | ["id", string]
  | ["op", "&&" | "||" | "==" | "="]
  | ["semi", ";"]
  | ["kw", "let"];

function tokenizeStr(str: string): StrToken[] {
  const result: StrToken[] = [];
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)|(==|&&|\|\||=|;)|(\d+\.?\d*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(str))) {
    const [text] = match;
    if (text === "true") result.push(["bool", true]);
    else if (text === "false") result.push(["bool", false]);
    else if (text === "let") result.push(["kw", "let"]);
    else if (text === "&&" || text === "||" || text === "==" || text === "=")
      result.push(["op", text as "&&" | "||" | "==" | "="]);
    else if (text === ";") result.push(["semi", ";"]);
    else if (/^[a-zA-Z_]/.test(text)) result.push(["id", text]);
    else result.push(["num", Number(text)]);
  }
  return result;
}

function evaluateStringExpr(
  str: string,
  vars: Record<string, number> = {},
): number | null {
  const tokens = tokenizeStr(str);
  let pos = 0;

  function peek(): StrToken | undefined {
    return tokens[pos];
  }

  function consume(): StrToken {
    return tokens[pos++]!;
  }

  function parseOr(): number | null {
    let left = parseAnd();
    while (peek()?.[0] === "op" && peek()![1] === "||") {
      consume();
      const right = parseAnd();
      if (left === null || right === null) return null;
      left = left || right;
    }
    return left;
  }

  function parseAnd(): number | null {
    let left = parseEq();
    while (peek()?.[0] === "op" && peek()![1] === "&&") {
      consume();
      const right = parseEq();
      if (left === null || right === null) return null;
      left = left && right;
    }
    return left;
  }

  function parseEq(): number | null {
    let left = parsePrimary();
    if (peek()?.[0] === "op" && peek()![1] === "==") {
      consume();
      const right = parsePrimary();
      if (left === null || right === null) return null;
      return left === right ? 1 : 0;
    }
    return left;
  }

  function parsePrimary(): number | null {
    const token = peek();
    if (!token) return null;
    if (token[0] === "num") {
      consume();
      return token[1];
    }
    if (token[0] === "bool") {
      consume();
      return token[1] ? 1 : 0;
    }
    if (token[0] === "id") {
      consume();
      const val = vars[token[1]];
      return val !== undefined ? val : null;
    }
    return null;
  }

  // Handle semicolon-separated statements
  let result: number | null = 0;
  while (pos < tokens.length) {
    if (peek()?.[0] === "kw" && peek()![1] === "let") {
      consume(); // "let"
      const idToken = peek();
      if (!idToken || idToken[0] !== "id") return null;
      const name = idToken[1];
      consume(); // id
      if (peek()?.[0] !== "op" || peek()![1] !== "=") return null;
      consume(); // "="
      const value = parseOr();
      if (value !== null) vars[name] = value;
      if (peek()?.[0] === "semi") consume();
    } else {
      result = parseOr();
      if (peek()?.[0] === "semi") consume();
    }
  }
  return result;
}

function parseLiteral(token: Token): number | null {
  if (token[0] === "num") return token[1];
  if (token[0] === "str") return evaluateStringExpr(token[1]);
  return null;
}

function parseNumber(
  p: { pos: number },
  tokens: Token[],
  env: Environment,
): number {
  const token = tokens[p.pos];
  if (!token) throw new Error("Expected number");
  const literal = parseLiteral(token);
  if (literal !== null) {
    p.pos++;
    return literal;
  }
  if (token[0] === "id") {
    p.pos++;
    const value = env.get(token[1]);
    if (value === undefined) throw new Error("Undefined variable: " + token[1]);
    if (typeof value === "object") return deref(value);
    return value;
  }
  throw new Error("Expected number");
}
