export function evaluate(source: string): number {
  if (source === "") return 0;

  const tokens = tokenize(source);
  const parser = { pos: 0 };
  const env: Scope = {};
  const mutable = new Set<string>();
  const result = parseProgram(parser, tokens, env, mutable);

  if (parser.pos < tokens.length) {
    throw new Error("Invalid source: " + source);
  }
  return result;
}

type Scope = Record<string, number | Ref> & { __parent?: Scope; __mutable?: Set<string> };

type Token =
  | ["num", number]
  | ["op", "+" | "-" | "*" | "/"]
  | ["group", "(" | ")" | "{" | "}"]
  | ["kw", "let"]
  | ["id", string]
  | ["assign", "="]
  | ["semi", ";"]
  | ["ref", "&"];

function tokenize(source: string): Token[] {
  const result: Token[] = [];
  const re = /(\d+\.?\d*|[+\-*/(){}=;&]|[a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const [text] = match;
    if (text === " " || text === "") continue;
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

// Reference type: holds a variable name and the scope it belongs to
type Ref = { name: string; scope: Scope };

function deref(ref: Ref): number {
  const val = lookup(ref.name, ref.scope);
  if (val === undefined) throw new Error("Reference to undefined variable");
  if (typeof val === "object") return deref(val);
  return val;
}

function parseProgram(p: { pos: number }, tokens: Token[], env: Scope, mutable: Set<string>): number {
  let last = 0;
  while (p.pos < tokens.length) {
    if (tokens[p.pos]![0] === "kw" && tokens[p.pos]![1] === "let") {
      last = parseLet(p, tokens, env, mutable);
    } else if (tokens[p.pos]![0] === "id" && p.pos + 1 < tokens.length && tokens[p.pos + 1]![0] === "assign") {
      // id = expr ;
      last = parseAssignment(p, tokens, env, mutable);
    } else {
      last = parseAddSub(p, tokens, env);
      // consume trailing semicolon if present
      if (p.pos < tokens.length && tokens[p.pos]![0] === "semi") p.pos++;
    }
  }
  return last;
}

function parseLet(p: { pos: number }, tokens: Token[], env: Scope, mutable: Set<string>): number {
  // let [mut] <id> = <expr> ;
  p.pos++; // consume "let"
  // optional "mut" keyword
  const isMut = tokens[p.pos]![0] === "id" && tokens[p.pos]![1] === "mut";
  if (isMut) {
    p.pos++; // consume "mut"
  }
  const idToken = tokens[p.pos];
  if (!idToken || idToken[0] !== "id") throw new Error("Expected identifier");
  const name = idToken[1];
  p.pos++; // consume id
  if (tokens[p.pos]![0] !== "assign") throw new Error("Expected =");
  p.pos++; // consume "="
  const value = parseAddSub(p, tokens, env);
  env[name] = value;
  if (isMut) mutable.add(name);
  // consume trailing semicolon
  if (p.pos < tokens.length && tokens[p.pos]![0] === "semi") p.pos++;
  return 0;
}

function parseAssignment(p: { pos: number }, tokens: Token[], env: Scope, mutable: Set<string>): number {
  const name = tokens[p.pos]![1];
  p.pos++; // consume id
  p.pos++; // consume "="
  const value = parseAddSub(p, tokens, env);
  if (!mutable.has(String(name))) throw new Error("Cannot assign to immutable variable: " + name);
  env[name] = value;
  // consume trailing semicolon
  if (p.pos < tokens.length && tokens[p.pos]![0] === "semi") p.pos++;
  return value;
}

function parseAddSub(p: { pos: number }, tokens: Token[], env: Scope): number {
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

function parseMulDiv(p: { pos: number }, tokens: Token[], env: Scope): number {
  let left = parseFactor(p, tokens, env);
  while (
    p.pos < tokens.length &&
    tokens[p.pos]![0] === "op" &&
    (tokens[p.pos]![1] === "*" || tokens[p.pos]![1] === "/")
  ) {
    // If * is followed by an identifier, it's dereference — stop
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

function parseFactor(p: { pos: number }, tokens: Token[], env: Scope): number {
  const token = tokens[p.pos];
  if (!token) throw new Error("Unexpected end");

  // &x — address-of
  if (token[0] === "ref") {
    p.pos++;
    const idToken = tokens[p.pos];
    if (!idToken || idToken[0] !== "id") throw new Error("Expected identifier after &");
    const name = idToken[1];
    p.pos++;
    return { name, scope: env } as any;
  }

  // *y — dereference
  if (token[0] === "op" && token[1] === "*") {
    const next = tokens[p.pos + 1];
    if (next && next[0] === "id") {
      p.pos++; // consume *
      p.pos++; // consume id
      const value = lookup(next[1], env);
      if (value === undefined) throw new Error("Undefined variable: " + next[1]);
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
    // Create a new block scope that inherits from parent
    const blockEnv: Scope = Object.create({});
    blockEnv.__parent = env;
    const blockMutable = new Set<string>();
    let last = 0;
    let found = false;
    let hasValue = false;
    while (p.pos < tokens.length && tokens[p.pos]![0] !== "group" && tokens[p.pos]![1] !== "}") {
      found = true;
      if (tokens[p.pos]![0] === "kw" && tokens[p.pos]![1] === "let") {
        parseLet(p, tokens, blockEnv, blockMutable);
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

function lookup(name: string, scope: Scope): number | Ref | undefined {
  let current: Scope | undefined = scope;
  while (current) {
    if (Object.prototype.hasOwnProperty.call(current, name)) return current[name];
    current = current.__parent;
  }
  return undefined;
}

function parseNumber(p: { pos: number }, tokens: Token[], env: Scope): number {
  const token = tokens[p.pos];
  if (!token) throw new Error("Expected number");
  if (token[0] === "num") {
    p.pos++;
    return token[1];
  }
  if (token[0] === "id") {
    p.pos++;
    const value = lookup(token[1], env);
    if (value === undefined) throw new Error("Undefined variable: " + token[1]);
    if (typeof value === "object") return deref(value);
    return value;
  }
  throw new Error("Expected number");
}
