type Token =
  | ["NUM", number]
  | ["OP", string]
  | ["IDENT", string]
  | ["EOF", null];

type Value = ["num", number] | ["bool", boolean];

interface Context {
  scope: Map<string, Value>;
  mutable: Set<string>;
}

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
    } else if (ch === "=" && input[i + 1] === "=") {
      tokens.push(["OP", "=="]);
      i += 2;
    } else {
      tokens.push(["OP", ch]);
      i++;
    }
  }
  tokens.push(["EOF", null]);
  return tokens;
}

function parseExpr(tokens: Token[], pos: [number], ctx: Context): Value {
  let left = parseComparison(tokens, pos, ctx);
  while (
    tokens[pos[0]]![0] === "OP" &&
    (tokens[pos[0]]![1] === "+" || tokens[pos[0]]![1] === "-")
  ) {
    const op = tokens[pos[0]++]![1] as "+" | "-";
    const right = parseComparison(tokens, pos, ctx);
    left = op === "+" ? ["num", (left[1] as number) + (right[1] as number)] : ["num", (left[1] as number) - (right[1] as number)];
  }
  return left;
}

function parseComparison(tokens: Token[], pos: [number], ctx: Context): Value {
  let left = parseTerm(tokens, pos, ctx);
  while (
    tokens[pos[0]]![0] === "OP" &&
    tokens[pos[0]]![1] === "=="
  ) {
    pos[0]++;
    const right = parseTerm(tokens, pos, ctx);
    left = left[0] === right[0] && left[1] === right[1] ? ["num", 1] : ["num", 0];
  }
  return left;
}

function parseTerm(tokens: Token[], pos: [number], ctx: Context): Value {
  let left = parseFactor(tokens, pos, ctx);
  while (
    tokens[pos[0]]![0] === "OP" &&
    (tokens[pos[0]]![1] === "*" || tokens[pos[0]]![1] === "/")
  ) {
    const op = tokens[pos[0]++]![1] as "*" | "/";
    const right = parseFactor(tokens, pos, ctx);
    left = op === "*" ? ["num", (left[1] as number) * (right[1] as number)] : ["num", (left[1] as number) / (right[1] as number)];
  }
  return left;
}

function parseFactor(tokens: Token[], pos: [number], ctx: Context): Value {
  const token = tokens[pos[0]];
  if (token && token[0] === "NUM") {
    pos[0]++;
    return ["num", token[1]];
  }
  if (token && token[0] === "IDENT" && token[1] === "true") {
    pos[0]++;
    return ["bool", true];
  }
  if (token && token[0] === "IDENT" && token[1] === "false") {
    pos[0]++;
    return ["bool", false];
  }
  if (token && token[0] === "IDENT") {
    pos[0]++;
    return ctx.scope.get(token[1])!;
  }
  if (token && token[0] === "OP" && (token[1] === "(" || token[1] === "{")) {
    pos[0]++;
    const blockCtx: Context = {
      scope: new Map(ctx.scope),
      mutable: new Set(ctx.mutable),
    };
    const closer = token[1] === "(" ? ")" : "}";
    let lastValue: Value = ["num", 0];
    while (tokens[pos[0]]![0] !== "EOF" && !(tokens[pos[0]]![0] === "OP" && tokens[pos[0]]![1] === closer)) {
      lastValue = parseStatement(tokens, pos, blockCtx);
    }
    if (tokens[pos[0]]![0] === "OP" && tokens[pos[0]]![1] === closer) {
      pos[0]++;
    }
    return lastValue;
  }
  throw new Error(`Unexpected token: ${token}`);
}

function isSingleEquals(tokens: Token[], idx: number): boolean {
  return tokens[idx]![0] === "OP" && tokens[idx]![1] === "=";
}

function parseStatement(tokens: Token[], pos: [number], ctx: Context): Value {
  if (tokens[pos[0]]![0] === "IDENT" && tokens[pos[0]]![1] === "let") {
    pos[0]++;
    const isMut = tokens[pos[0]]![0] === "IDENT" && tokens[pos[0]]![1] === "mut";
    if (isMut) {
      pos[0]++;
    }
    const name = tokens[pos[0]]![1] as string;
    pos[0]++;
    pos[0]++;
    return assignAndSkip(tokens, pos, ctx, name, isMut);
  }
  if (tokens[pos[0]]![0] === "IDENT" && isSingleEquals(tokens, pos[0] + 1)) {
    const name = tokens[pos[0]]![1] as string;
    if (!ctx.mutable.has(name)) {
      throw new Error(`Cannot assign to immutable variable '${name}'`);
    }
    pos[0] += 2;
    return assignAndSkip(tokens, pos, ctx, name, false);
  }
  const value = parseExpr(tokens, pos, ctx);
  if (tokens[pos[0]]![0] === "OP" && tokens[pos[0]]![1] === ";") {
    pos[0]++;
  }
  return value;
}

function assignAndSkip(tokens: Token[], pos: [number], ctx: Context, name: string, isMut: boolean): Value {
  const value = parseExpr(tokens, pos, ctx);
  ctx.scope.set(name, value);
  if (isMut) {
    ctx.mutable.add(name);
  }
  if (tokens[pos[0]]![0] === "OP" && tokens[pos[0]]![1] === ";") {
    pos[0]++;
  }
  return ["num", 0];
}

export function interpret(input: string): number {
  if (input === "") return 0;
  const tokens = tokenize(input);
  const pos: [number] = [0];
  const ctx: Context = {
    scope: new Map(),
    mutable: new Set(),
  };
  let lastValue: Value = ["num", 0];
  while (tokens[pos[0]]![0] !== "EOF") {
    lastValue = parseStatement(tokens, pos, ctx);
  }
  return lastValue[0] === "bool" ? (lastValue[1] ? 1 : 0) : (lastValue[1] as number);
}
