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
    } else if (ch === "|" && source[i + 1] === "|") {
      tokens.push("||");
      i += 2;
    } else if (ch === "&" && source[i + 1] === "&") {
      tokens.push("&&");
      i += 2;
    } else if ((ch === "<" || ch === ">") && source[i + 1] === "=") {
      tokens.push(ch + "=");
      i += 2;
    } else if (ch === "!" && source[i + 1] === "=") {
      tokens.push("!=");
      i += 2;
    } else if (ch === "=" && source[i + 1] === "=") {
      tokens.push("==");
      i += 2;
    } else {
      tokens.push(ch);
      i++;
    }
  }
  return tokens;
}

const PREC: Record<string, number> = {
  "||": 0,
  "&&": 1,
  "<": 2,
  ">": 2,
  "<=": 2,
  ">=": 2,
  "==": 2,
  "!=": 2,
  "+": 3,
  "-": 3,
  "*": 4,
  "/": 4,
};

interface WorkFrame {
  s: number;
  e: number;
  v: number[];
  o: string[];
  n?: string;
  ifThen?: number;
  ifThenEnd?: number;
  ifElse?: number;
  ifAfter?: number;
}

function applyOp(op: string, a: number, b: number): number {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") return a / b;
  if (op === "||") return a || b ? 1 : 0;
  if (op === "&&") return a && b ? 1 : 0;
  if (op === "<") return a < b ? 1 : 0;
  if (op === ">") return a > b ? 1 : 0;
  if (op === "<=") return a <= b ? 1 : 0;
  if (op === ">=") return a >= b ? 1 : 0;
  if (op === "==") return a == b ? 1 : 0;
  if (op === "!=") return a != b ? 1 : 0;
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
  const work: WorkFrame[] = [];
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
      if (p.ifThen !== undefined) {
        const next = resumeIf(p, r);
        v = next.v;
        o = next.o;
        pos = next.pos;
        e = next.e;
      } else {
        v = p.v;
        o = p.o;
        pos = p.s;
        e = p.e;
        if (p.n) currentScope(scopeStack).set(p.n, r);
        if (!p.n) v.push(r);
      }
      continue;
    }
    const t = tokens[pos]!;
    const next = dispatchToken(tokens, pos, t, e, v, o, scopeStack);
    v = next.v;
    o = next.o;
    pos = next.pos;
    e = next.e;
    if (next.frame) work.push(next.frame);
  }
}

function resumeIf(
  p: WorkFrame,
  r: number,
): { v: number[]; o: string[]; pos: number; e: number } {
  if (r) return { v: [], o: [], pos: p.ifThen!, e: p.ifThenEnd! };
  return { v: [], o: [], pos: p.ifElse!, e: p.ifAfter! };
}

function dispatchToken(
  tokens: string[],
  pos: number,
  t: string,
  e: number,
  v: number[],
  o: string[],
  scopeStack: Map<string, number>[][],
): { v: number[]; o: string[]; pos: number; e: number; frame?: WorkFrame } {
  if (t === "let") return dispatchLet(tokens, pos, e);
  if (t === "if") return dispatchIf(tokens, pos, e);
  if (tokens[pos + 1] === "=" && PREC[t] === undefined) return dispatchAssign(tokens, pos, t, e);
  const newPos = processToken(tokens, pos, o, v, scopeStack);
  return { v, o, pos: newPos, e };
}

function dispatchLet(tokens: string[], pos: number, e: number): { v: number[]; o: string[]; pos: number; e: number; frame?: WorkFrame } {
  const { name, es, ee } = parseLet(tokens, pos);
  return { v: [], o: [], pos: es, e: ee, frame: { s: ee, e, v: [], o: [], n: name } };
}

function dispatchIf(tokens: string[], pos: number, e: number): { v: number[]; o: string[]; pos: number; e: number; frame?: WorkFrame } {
  const { condEnd, thenStart, thenEnd, elseStart } = findIfParts(tokens, pos);
  return {
    v: [], o: [], pos: pos + 2, e: condEnd,
    frame: { s: elseStart, e, v: [], o: [], ifThen: thenStart, ifThenEnd: thenEnd, ifElse: elseStart, ifAfter: e },
  };
}

function dispatchAssign(tokens: string[], pos: number, t: string, e: number): { v: number[]; o: string[]; pos: number; e: number; frame?: WorkFrame } {
  const es = pos + 2;
  const ee = findExprEnd(tokens, es);
  return { v: [], o: [], pos: es, e: ee, frame: { s: ee, e, v: [], o: [], n: t } };
}

function parseLet(
  tokens: string[],
  pos: number,
): { name: string; es: number; ee: number } {
  const mutIdx = tokens[pos + 1] === "mut" ? 1 : 0;
  const name = tokens[pos + 1 + mutIdx]!;
  const es = pos + 2 + mutIdx + 1;
  const ee = findExprEnd(tokens, es);
  return { name, es, ee };
}

function findIfParts(
  tokens: string[],
  pos: number,
): { condEnd: number; thenStart: number; thenEnd: number; elseStart: number } {
  const condEnd = findParenEnd(tokens, pos + 1);
  const thenStart = condEnd + 1;
  const thenEnd = findElse(tokens, thenStart);
  const elseStart = thenEnd + 1;
  return { condEnd, thenStart, thenEnd, elseStart };
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
      if (depth === 0) {
        const next = tokens[pos + 1];
        if (next && PREC[next] !== undefined) {
          pos++;
          continue;
        }
        return pos;
      }
      depth--;
    } else if (t === ";" && depth === 0) return pos;
    pos++;
  }
  return pos;
}

function findParenEnd(tokens: string[], start: number): number {
  let depth = 0;
  let pos = start;
  while (pos < tokens.length) {
    if (tokens[pos] === "(") depth++;
    else if (tokens[pos] === ")") {
      depth--;
      if (depth === 0) return pos;
    }
    pos++;
  }
  return pos;
}

function findElse(tokens: string[], start: number): number {
  let depth = 0;
  let pos = start;
  while (pos < tokens.length) {
    const t = tokens[pos]!;
    if (t === "(" || t === "{") depth++;
    else if (t === ")" || t === "}") {
      depth--;
    } else if (t === "else" && depth === 0) return pos;
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
    } else if (token === "if") {
      const { elseStart } = findIfParts(tokens, pos);
      const ifEnd = findExprEnd(tokens, elseStart);
      const val = evalRange(tokens, pos, ifEnd, scopeStack);
      values.push(val);
      pos = ifEnd;
    } else if (token === "let") {
      pos = handleLetAssign(tokens, pos, scopeStack);
    } else if (tokens[pos + 1] === "=" && PREC[token] === undefined) {
      pos = handleAssign(tokens, pos, scopeStack);
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
  if (scope.has(token)) return scope.get(token)!;
  if (token === "true") return 1;
  if (token === "false") return 0;
  return Number(token);
}

function handleLetAssign(
  tokens: string[],
  pos: number,
  scopeStack: Map<string, number>[][],
): number {
  const mutIdx = tokens[pos + 1] === "mut" ? 1 : 0;
  const name = tokens[pos + 1 + mutIdx]!;
  const exprStart = pos + 2 + mutIdx + 1;
  return evalAndAssign(tokens, exprStart, name, scopeStack);
}

function handleAssign(
  tokens: string[],
  pos: number,
  scopeStack: Map<string, number>[][],
): number {
  const name = tokens[pos]!;
  const exprStart = pos + 2;
  return evalAndAssign(tokens, exprStart, name, scopeStack);
}

function evalAndAssign(
  tokens: string[],
  start: number,
  name: string,
  scopeStack: Map<string, number>[][],
): number {
  const end = findExprEnd(tokens, start);
  const val = evalRange(tokens, start, end, scopeStack);
  currentScope(scopeStack).set(name, val);
  return end + (tokens[end] === ";" ? 1 : 0);
}

export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return 0;

  return parse(tokens);
}
