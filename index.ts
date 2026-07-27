function tokenize(source: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === " " || ch === "\t") {
      i++;
    } else if (/[0-9]/.test(ch)) {
      let num = "";
      while (i < source.length && /[0-9.]/.test(source[i]!)) {
        num += source[i++];
      }
      tokens.push(num);
    } else if (/[a-zA-Z_]/.test(ch)) {
      let word = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) {
        word += source[i++];
      }
      tokens.push(word);
    } else {
      tokens.push(ch);
      i++;
    }
  }
  return tokens;
}

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

function applyOp(op: string, a: number, b: number): number {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return a / b;
  return b;
}

function reduceOps(ops: string[], values: number[]): void {
  while (ops.length > 0) {
    const op = ops.pop()!;
    if (op === "(" || op === "{") continue;
    const b = values.pop()!;
    const a = values.pop()!;
    values.push(applyOp(op, a, b));
  }
}

function evalRange(
  tokens: string[],
  start: number,
  end: number,
  scopeStack: Map<string, number>[][],
): number {
  const work: { s: number; e: number; v: number[]; o: string[]; n?: string }[] =
    [];
  let v: number[] = [];
  let o: string[] = [];
  let pos = start;
  let e = end;

  while (true) {
    if (pos >= e) {
      reduceOps(o, v);
      const r = v[0] ?? 0;
      const p = work.pop();
      if (!p) return r;
      v = p.v;
      o = p.o;
      pos = p.s;
      e = p.e;
      if (p.n) currentScope(scopeStack).set(p.n, r);
      continue;
    }
    const t = tokens[pos]!;
    if (t === "let") {
      const name = tokens[pos + 1]!;
      const es = pos + 3;
      const ee = findExprEnd(tokens, es);
      work.push({ s: ee + (tokens[ee] === ";" ? 1 : 0), e, v, o, n: name });
      v = [];
      o = [];
      pos = es;
      e = ee;
    } else {
      pos = processToken(tokens, pos, o, v, scopeStack);
    }
  }
}

function processToken(
  tokens: string[],
  pos: number,
  o: string[],
  v: number[],
  scopeStack: Map<string, number>[][],
): number {
  const t = tokens[pos]!;
  if (t === "(") {
    o.push(t);
    return pos + 1;
  }
  if (t === ")") {
    reduceUntil(o, v, "(");
    return pos + 1;
  }
  if (t === "{") {
    pushScope(scopeStack);
    o.push(t);
    return pos + 1;
  }
  if (t === "}") {
    reduceUntil(o, v, "{");
    popScope(scopeStack);
    return pos + 1;
  }
  if (t === ";") return pos + 1;
  if (PREC[t] !== undefined) {
    pushOp(o, v, t);
    return pos + 1;
  }
  v.push(resolve(t, scopeStack));
  return pos + 1;
}

function findExprEnd(tokens: string[], start: number): number {
  let pos = start;
  let depth = 0;
  while (pos < tokens.length) {
    const t = tokens[pos]!;
    if (t === "(" || t === "{") depth++;
    else if (t === ")" || t === "}") {
      if (depth === 0) return pos;
      depth--;
    } else if (t === ";" && depth === 0) return pos;
    pos++;
  }
  return pos;
}

function parse(tokens: string[]): number {
  const scope: Map<string, number> = new Map();
  const values: number[] = [];
  const ops: string[] = [];
  const scopeStack: Map<string, number>[][] = [[scope]];
  let pos = 0;

  while (pos < tokens.length) {
    const token = tokens[pos]!;

    if (token === "(") {
      ops.push(token);
      pos++;
    } else if (token === ")") {
      reduceUntil(ops, values, "(");
      pos++;
    } else if (token === "{") {
      pushScope(scopeStack);
      ops.push(token);
      pos++;
    } else if (token === "}") {
      reduceUntil(ops, values, "{");
      popScope(scopeStack);
      pos++;
    } else if (token === "let") {
      const name = tokens[pos + 1]!;
      const exprStart = pos + 3;
      const end = findExprEnd(tokens, exprStart);
      const val = evalRange(tokens, exprStart, end, scopeStack);
      currentScope(scopeStack).set(name, val);
      pos = end + (tokens[end] === ";" ? 1 : 0);
    } else if (token === ";") {
      pos++;
    } else if (PREC[token] !== undefined) {
      pushOp(ops, values, token);
      pos++;
    } else {
      values.push(resolve(token, scopeStack));
      pos++;
    }
  }

  reduceOps(ops, values);
  return values[0] ?? 0;
}

function reduceUntil(ops: string[], values: number[], stop: string): void {
  while (ops.length > 0 && ops[ops.length - 1] !== stop) {
    const op = ops.pop()!;
    const b = values.pop()!;
    const a = values.pop()!;
    values.push(applyOp(op, a, b));
  }
  ops.pop();
}

function pushOp(ops: string[], values: number[], token: string): void {
  const prec = PREC[token]!;
  while (
    ops.length > 0 &&
    ops[ops.length - 1] !== "(" &&
    ops[ops.length - 1] !== "{" &&
    PREC[ops[ops.length - 1] as string]! >= prec
  ) {
    const b = values.pop()!;
    const a = values.pop()!;
    values.push(applyOp(ops.pop()!, a, b));
  }
  ops.push(token);
}

function pushScope(scopeStack: Map<string, number>[][]): void {
  const level = scopeStack[scopeStack.length - 1]!;
  const parent = level[level.length - 1]!;
  scopeStack[scopeStack.length - 1] = [...level, new Map(parent)];
}

function popScope(scopeStack: Map<string, number>[][]): void {
  scopeStack[scopeStack.length - 1]!.pop();
}

function currentScope(
  scopeStack: Map<string, number>[][],
): Map<string, number> {
  const level = scopeStack[scopeStack.length - 1]!;
  return level[level.length - 1]!;
}

function resolve(token: string, scopeStack: Map<string, number>[][]): number {
  const scope = currentScope(scopeStack);
  return scope.has(token) ? scope.get(token)! : Number(token);
}

export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return 0;

  return parse(tokens);
}
