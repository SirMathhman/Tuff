export function evaluate(source: string): number {
  if (source === "") return 0;

  const tokens = tokenize(source);
  const parser = { pos: 0 };
  const env: Record<string, number> = {};
  const result = parseProgram(parser, tokens, env);

  if (parser.pos < tokens.length) {
    throw new Error("Invalid source: " + source);
  }
  return result;
}

type Token =
  | ["num", number]
  | ["op", "+" | "-" | "*" | "/"]
  | ["group", "(" | ")" | "{" | "}"]
  | ["kw", "let"]
  | ["id", string]
  | ["assign", "="]
  | ["semi", ";"];

function tokenize(source: string): Token[] {
  const result: Token[] = [];
  const re = /(\d+\.?\d*|[+\-*/(){}=;]|[a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const [text] = match;
    if (text === " " || text === "") continue;
    if (text === "+" || text === "-" || text === "*" || text === "/") {
      result.push(["op", text as "+" | "-" | "*" | "/"]);
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

function parseProgram(p: { pos: number }, tokens: Token[], env: Record<string, number>): number {
  let last = 0;
  while (p.pos < tokens.length) {
    if (tokens[p.pos]![0] === "kw" && tokens[p.pos]![1] === "let") {
      last = parseLet(p, tokens, env);
    } else {
      last = parseAddSub(p, tokens, env);
      // consume trailing semicolon if present
      if (p.pos < tokens.length && tokens[p.pos]![0] === "semi") p.pos++;
    }
  }
  return last;
}

function parseLet(p: { pos: number }, tokens: Token[], env: Record<string, number>): number {
  // let <id> = <expr> ;
  p.pos++; // consume "let"
  const idToken = tokens[p.pos];
  if (!idToken || idToken[0] !== "id") throw new Error("Expected identifier");
  const name = idToken[1];
  p.pos++; // consume id
  if (tokens[p.pos]![0] !== "assign") throw new Error("Expected =");
  p.pos++; // consume "="
  const value = parseAddSub(p, tokens, env);
  env[name] = value;
  // consume trailing semicolon
  if (p.pos < tokens.length && tokens[p.pos]![0] === "semi") p.pos++;
  return 0;
}

function parseAddSub(p: { pos: number }, tokens: Token[], env: Record<string, number>): number {
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

function parseMulDiv(p: { pos: number }, tokens: Token[], env: Record<string, number>): number {
  let left = parseFactor(p, tokens, env);
  while (
    p.pos < tokens.length &&
    tokens[p.pos]![0] === "op" &&
    (tokens[p.pos]![1] === "*" || tokens[p.pos]![1] === "/")
  ) {
    const op = tokens[p.pos]![1];
    p.pos++;
    const right = parseFactor(p, tokens, env);
    left = op === "*" ? left * right : left / right;
  }
  return left;
}

function parseFactor(p: { pos: number }, tokens: Token[], env: Record<string, number>): number {
  const token = tokens[p.pos];
  if (!token) throw new Error("Unexpected end");
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
    let last = 0;
    let found = false;
    while (p.pos < tokens.length && tokens[p.pos]![0] !== "group" && tokens[p.pos]![1] !== "}") {
      found = true;
      if (tokens[p.pos]![0] === "kw" && tokens[p.pos]![1] === "let") {
        last = parseLet(p, tokens, env);
      } else {
        last = parseAddSub(p, tokens, env);
        if (p.pos < tokens.length && tokens[p.pos]![0] === "semi") p.pos++;
      }
    }
    if (!found) throw new Error("Empty block");
    if (tokens[p.pos]![0] !== "group" || tokens[p.pos]![1] !== "}") {
      throw new Error("Expected }");
    }
    p.pos++;
    return last;
  }
  return parseNumber(p, tokens, env);
}

function parseNumber(p: { pos: number }, tokens: Token[], env: Record<string, number>): number {
  const token = tokens[p.pos];
  if (!token) throw new Error("Expected number");
  if (token[0] === "num") {
    p.pos++;
    return token[1];
  }
  if (token[0] === "id") {
    p.pos++;
    if (!(token[1] in env)) throw new Error("Undefined variable: " + token[1]);
    return env[token[1]]!;
  }
  throw new Error("Expected number");
}
