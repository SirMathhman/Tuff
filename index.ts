type Token =
  | ["NUM", number]
  | ["OP", string]
  | ["IDENT", string]
  | ["EOF", null];

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/\d/.test(ch)) {
      let num = "";
      while (i < input.length && /\d/.test(input[i]!)) {
        num += input[i]!;
        i++;
      }
      tokens.push(["NUM", Number(num)]);
    } else if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (
        i < input.length &&
        /[\w]/.test(input[i]!)
      ) {
        ident += input[i]!;
        i++;
      }
      tokens.push(["IDENT", ident]);
    } else {
      tokens.push(["OP", ch]);
      i++;
    }
  }
  tokens.push(["EOF", null]);
  return tokens;
}

function parseExpr(tokens: Token[], pos: [number], scope: Map<string, number>): number {
  let left = parseTerm(tokens, pos, scope);
  while (
    tokens[pos[0]]![0] === "OP" &&
    (tokens[pos[0]]![1] === "+" || tokens[pos[0]]![1] === "-")
  ) {
    const op = tokens[pos[0]++]![1] as "+" | "-";
    const right = parseTerm(tokens, pos, scope);
    left = op === "+" ? left + right : left - right;
  }
  return left;
}

function parseTerm(tokens: Token[], pos: [number], scope: Map<string, number>): number {
  let left = parseFactor(tokens, pos, scope);
  while (
    tokens[pos[0]]![0] === "OP" &&
    (tokens[pos[0]]![1] === "*" || tokens[pos[0]]![1] === "/")
  ) {
    const op = tokens[pos[0]++]![1] as "*" | "/";
    const right = parseFactor(tokens, pos, scope);
    left = op === "*" ? left * right : left / right;
  }
  return left;
}

function parseFactor(tokens: Token[], pos: [number], scope: Map<string, number>): number {
  const token = tokens[pos[0]];
  if (token && token[0] === "NUM") {
    pos[0]++;
    return token[1];
  }
  if (token && token[0] === "IDENT") {
    pos[0]++;
    return scope.get(token[1])!;
  }
  if (token && token[0] === "OP" && (token[1] === "(" || token[1] === "{")) {
    pos[0]++;
    const blockScope = new Map(scope);
    const closer = token[1] === "(" ? ")" : "}";
    let lastValue = 0;
    while (tokens[pos[0]]![0] !== "EOF" && !(tokens[pos[0]]![0] === "OP" && tokens[pos[0]]![1] === closer)) {
      lastValue = parseStatement(tokens, pos, blockScope);
    }
    if (tokens[pos[0]]![0] === "OP" && tokens[pos[0]]![1] === closer) {
      pos[0]++;
    }
    return lastValue;
  }
  throw new Error(`Unexpected token: ${token}`);
}

function parseStatement(tokens: Token[], pos: [number], scope: Map<string, number>): number {
  if (tokens[pos[0]]![0] === "IDENT" && tokens[pos[0]]![1] === "let") {
    pos[0]++;
    const name = tokens[pos[0]]![1] as string;
    pos[0]++;
    pos[0]++;
    const value = parseExpr(tokens, pos, scope);
    scope.set(name, value);
    if (tokens[pos[0]]![0] === "OP" && tokens[pos[0]]![1] === ";") {
      pos[0]++;
    }
    return 0;
  }
  const value = parseExpr(tokens, pos, scope);
  if (tokens[pos[0]]![0] === "OP" && tokens[pos[0]]![1] === ";") {
    pos[0]++;
  }
  return value;
}

export function interpret(input: string): number {
  if (input === "") return 0;
  const tokens = tokenize(input);
  const pos: [number] = [0];
  const scope = new Map<string, number>();
  let lastValue = 0;
  while (tokens[pos[0]]![0] !== "EOF") {
    lastValue = parseStatement(tokens, pos, scope);
  }
  return lastValue;
}
