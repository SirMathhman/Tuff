export function interpret(source: string): number {
  const tokens = tokenize(source);
  const env: Record<string, number> = {};
  const mutable = new Set<string>();
  let result = 0;
  const ctx = { pos: 0, env, mutable };

  while (ctx.pos < tokens.length) {
    result = processStatement(tokens, ctx, result);
  }
  return result;
}

function processStatement(tokens: string[], ctx: { pos: number; env: Record<string, number>; mutable: Set<string> }, result: number): number {
  if (ctx.pos >= tokens.length) return result;
  if (tokens[ctx.pos] === 'let') return processLet(tokens, ctx);
  if (isAssignment(tokens, ctx.pos)) return processAssignment(tokens, ctx);
  return processExpr(tokens, ctx, result);
}

function processLet(tokens: string[], ctx: { pos: number; env: Record<string, number>; mutable: Set<string> }): number {
  ctx.pos++; // skip 'let'
  const isMut = ctx.pos < tokens.length && tokens[ctx.pos] === 'mut';
  if (isMut) ctx.pos++; // skip 'mut'
  const name = tokens[ctx.pos]!;
  ctx.pos++; // skip identifier
  ctx.pos++; // skip '='
  const value = parseExpression(tokens, ctx);
  ctx.env[name] = value;
  if (isMut) ctx.mutable.add(name);
  if (ctx.pos < tokens.length && tokens[ctx.pos] === ';') ctx.pos++;
  return 0;
}

function processAssignment(tokens: string[], ctx: { pos: number; env: Record<string, number>; mutable: Set<string> }): number {
  const name = tokens[ctx.pos]!;
  ctx.pos++; // skip identifier
  ctx.pos++; // skip '='
  if (ctx.env[name] === undefined) {
    throw new Error(`undefined identifier: ${name}`);
  }
  if (!ctx.mutable.has(name)) {
    throw new Error(`cannot assign to immutable variable: ${name}`);
  }
  const value = parseExpression(tokens, ctx);
  ctx.env[name] = value;
  if (ctx.pos < tokens.length && tokens[ctx.pos] === ';') ctx.pos++;
  return 0;
}

function processExpr(tokens: string[], ctx: { pos: number; env: Record<string, number>; mutable: Set<string> }, result: number): number {
  result = parseExpression(tokens, ctx);
  if (ctx.pos < tokens.length && tokens[ctx.pos] === ';') ctx.pos++;
  return result;
}

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/\d/.test(ch)) {
      tokens.push(readNumber(source, i));
      i = skipDigits(source, i);
    } else if (/[a-zA-Z_]/.test(ch)) {
      tokens.push(readIdentifier(source, i));
      i = skipIdentifier(source, i);
    } else if (isOperator(ch)) {
      tokens.push(ch);
      i++;
    } else {
      i++;
    }
  }
  return tokens;
}

function readNumber(source: string, start: number): string {
  let num = '';
  for (let i = start; i < source.length && /\d/.test(source[i]!); i++) {
    num += source[i]!;
  }
  return num;
}

function skipDigits(source: string, start: number): number {
  let i = start;
  while (i < source.length && /\d/.test(source[i]!)) i++;
  return i;
}

function readIdentifier(source: string, start: number): string {
  let ident = '';
  for (let i = start; i < source.length && /[a-zA-Z0-9_]/.test(source[i]!); i++) {
    ident += source[i]!;
  }
  return ident;
}

function skipIdentifier(source: string, start: number): number {
  let i = start;
  while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) i++;
  return i;
}

function isOperator(ch: string): boolean {
  return '+-*/()=;'.includes(ch);
}

function isAssignment(tokens: string[], pos: number): boolean {
  if (pos >= tokens.length) return false;
  const nextPos = pos + 1;
  if (tokens[pos] === 'let' || tokens[pos] === 'mut') return false;
  return /[a-zA-Z_]/.test(tokens[pos]!) && nextPos < tokens.length && tokens[nextPos] === '=';
}

function parseExpression(tokens: string[], ctx: { pos: number; env: Record<string, number> }): number {
  let left = parseTerm(tokens, ctx);
  while (ctx.pos < tokens.length && (tokens[ctx.pos] === '+' || tokens[ctx.pos] === '-')) {
    const op = tokens[ctx.pos]!;
    ctx.pos++;
    const right = parseTerm(tokens, ctx);
    left = op === '+' ? left + right : left - right;
  }
  return left;
}

function parseTerm(tokens: string[], ctx: { pos: number; env: Record<string, number> }): number {
  let left = parseFactor(tokens, ctx);
  while (ctx.pos < tokens.length && (tokens[ctx.pos] === '*' || tokens[ctx.pos] === '/')) {
    const op = tokens[ctx.pos]!;
    ctx.pos++;
    const right = parseFactor(tokens, ctx);
    left = op === '*' ? left * right : left / right;
  }
  return left;
}

function parseFactor(tokens: string[], ctx: { pos: number; env: Record<string, number> }): number {
  if (ctx.pos >= tokens.length) return 0;
  const token = tokens[ctx.pos]!;
  if (token === '(') {
    ctx.pos++;
    const result = parseExpression(tokens, ctx);
    if (ctx.pos < tokens.length && tokens[ctx.pos] === ')') {
      ctx.pos++;
    }
    return result;
  }
  if (/[a-zA-Z_]/.test(token)) {
    ctx.pos++;
    if (ctx.env[token] !== undefined) {
      return ctx.env[token];
    }
    throw new Error(`undefined identifier: ${token}`);
  }
  ctx.pos++;
  return parseInt(token, 10);
}
