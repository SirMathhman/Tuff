type Scope = { env: Record<string, number>; mutable: Set<string> };
type Ctx = { pos: number; scopes: Scope[] };

export function interpret(source: string): number {
  const tokens = tokenize(source);
  const scopes: Scope[] = [{ env: {}, mutable: new Set() }];
  let result = 0;
  const ctx: Ctx = { pos: 0, scopes };

  while (ctx.pos < tokens.length) {
    result = processStatement(tokens, ctx, result);
  }
  return result;
}

function processStatement(tokens: string[], ctx: Ctx, result: number): number {
  if (ctx.pos >= tokens.length) return result;
  if (tokens[ctx.pos] === 'let') return processLet(tokens, ctx);
  if (isCompoundAssignment(tokens, ctx.pos)) return processCompoundAssignment(tokens, ctx);
  if (isAssignment(tokens, ctx.pos)) return processAssignment(tokens, ctx);
  if (tokens[ctx.pos] === '{') return processBlock(tokens, ctx);
  if (tokens[ctx.pos] === 'if') return processIf(tokens, ctx);
  if (tokens[ctx.pos] === 'else') { ctx.pos++; return 0; }
  return processExpr(tokens, ctx, result);
}

function processBlock(tokens: string[], ctx: Ctx): number {
  ctx.pos++; // skip '{'
  ctx.scopes.push({ env: {}, mutable: new Set() });
  while (ctx.pos < tokens.length && tokens[ctx.pos] !== '}') {
    processStatement(tokens, ctx, 0);
  }
  if (ctx.pos < tokens.length) ctx.pos++; // skip '}'
  ctx.scopes.pop();
  return 0;
}

function processIf(tokens: string[], ctx: Ctx): number {
  ctx.pos++; // skip 'if'
  ctx.pos++; // skip '('
  const condition = parseOrExpression(tokens, ctx);
  ctx.pos++; // skip ')'
  if (condition) {
    processStatement(tokens, ctx, 0);
    if (ctx.pos < tokens.length && tokens[ctx.pos] === 'else') {
      ctx.pos++; // skip 'else'
      skipStatement(tokens, ctx);
    }
  } else {
    if (ctx.pos < tokens.length && tokens[ctx.pos] === 'else') {
      ctx.pos++; // skip 'else'
      processStatement(tokens, ctx, 0);
    } else {
      skipStatement(tokens, ctx); // skip the then-branch
    }
  }
  return 0;
}

function skipStatement(tokens: string[], ctx: { pos: number }): void {
  if (ctx.pos >= tokens.length) return;
  if (tokens[ctx.pos] === '{') return skipBlock(tokens, ctx);
  if (tokens[ctx.pos] === 'if') return skipIf(tokens, ctx);
  skipSimple(tokens, ctx);
}

function skipBlock(tokens: string[], ctx: { pos: number }): void {
  let depth = 1;
  ctx.pos++;
  while (ctx.pos < tokens.length && depth > 0) {
    if (tokens[ctx.pos] === '{') depth++;
    if (tokens[ctx.pos] === '}') depth--;
    ctx.pos++;
  }
}

function skipIf(tokens: string[], ctx: { pos: number }): void {
  ctx.pos++; // skip 'if'
  if (ctx.pos < tokens.length) ctx.pos++; // skip '('
  skipParen(tokens, ctx);
  skipStatement(tokens, ctx);
  if (ctx.pos < tokens.length && tokens[ctx.pos] === 'else') {
    ctx.pos++;
    skipStatement(tokens, ctx);
  }
}

function skipParen(tokens: string[], ctx: { pos: number }): void {
  let depth = 1;
  while (ctx.pos < tokens.length && depth > 0) {
    if (tokens[ctx.pos] === '(') depth++;
    if (tokens[ctx.pos] === ')') depth--;
    ctx.pos++;
  }
}

function skipSimple(tokens: string[], ctx: { pos: number }): void {
  while (ctx.pos < tokens.length && tokens[ctx.pos] !== ';') ctx.pos++;
  if (ctx.pos < tokens.length) ctx.pos++;
}

function processLet(tokens: string[], ctx: Ctx): number {
  ctx.pos++; // skip 'let'
  const isMut = ctx.pos < tokens.length && tokens[ctx.pos] === 'mut';
  if (isMut) ctx.pos++; // skip 'mut'
  const name = tokens[ctx.pos]!;
  ctx.pos++; // skip identifier
  ctx.pos++; // skip '='
  const value = parseExpression(tokens, ctx);
  const currentScope = ctx.scopes[ctx.scopes.length - 1]!;
  currentScope.env[name] = value;
  if (isMut) currentScope.mutable.add(name);
  if (ctx.pos < tokens.length && tokens[ctx.pos] === ';') ctx.pos++;
  return 0;
}

function processAssignment(tokens: string[], ctx: Ctx): number {
  processAssignmentOp(tokens, ctx, (scope, name, value) => { scope.env[name] = value; });
  return 0;
}

function processCompoundAssignment(tokens: string[], ctx: Ctx): number {
  processAssignmentOp(tokens, ctx, (scope, name, value) => { scope.env[name] = scope.env[name]! + value; });
  return 0;
}

function processAssignmentOp(tokens: string[], ctx: Ctx, writeBack: (scope: Scope, name: string, value: number) => void): void {
  const name = readAndSkipIdentifier(tokens, ctx);
  ctx.pos++; // skip operator
  const scope = validateMutableTarget(name, ctx);
  const value = parseExpression(tokens, ctx);
  writeBack(scope, name, value);
  if (ctx.pos < tokens.length && tokens[ctx.pos] === ';') ctx.pos++;
}

function readAndSkipIdentifier(tokens: string[], ctx: { pos: number }): string {
  const name = tokens[ctx.pos]!;
  ctx.pos++;
  return name;
}

function validateMutableTarget(name: string, ctx: Ctx): Scope {
  if (!lookup(name, ctx)) {
    throw new Error(`undefined identifier: ${name}`);
  }
  const scope = findScope(name, ctx);
  if (!scope || !scope.mutable.has(name)) {
    throw new Error(`cannot assign to immutable variable: ${name}`);
  }
  return scope;
}

function processExpr(tokens: string[], ctx: Ctx, result: number): number {
  result = parseOrExpression(tokens, ctx);
  if (ctx.pos < tokens.length && tokens[ctx.pos] === ';') ctx.pos++;
  return result;
}

function parseOrExpression(tokens: string[], ctx: Ctx): number {
  let left = parseAndExpression(tokens, ctx);
  while (ctx.pos < tokens.length && tokens[ctx.pos] === '||') {
    ctx.pos++;
    const right = parseAndExpression(tokens, ctx);
    left = left || right;
  }
  return left;
}

function parseAndExpression(tokens: string[], ctx: Ctx): number {
  let left = parseExpression(tokens, ctx);
  while (ctx.pos < tokens.length && tokens[ctx.pos] === '&&') {
    ctx.pos++;
    const right = parseExpression(tokens, ctx);
    left = left && right;
  }
  return left;
}

function lookup(name: string, ctx: Ctx): boolean {
  for (let i = ctx.scopes.length - 1; i >= 0; i--) {
    if (ctx.scopes[i]!.env[name] !== undefined) return true;
  }
  return false;
}

function findScope(name: string, ctx: Ctx): Scope | null {
  for (let i = ctx.scopes.length - 1; i >= 0; i--) {
    if (ctx.scopes[i]!.env[name] !== undefined) return ctx.scopes[i]!;
  }
  return null;
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
    } else if (tryMultiCharOp(source, i, tokens)) {
      i += getMultiCharLen(tokens[tokens.length - 1]!);
    } else if (isOperator(ch)) {
      tokens.push(ch);
      i++;
    } else {
      i++;
    }
  }
  return tokens;
}

function tryMultiCharOp(source: string, pos: number, tokens: string[]): boolean {
  const ch = source[pos]!;
  const next = source[pos + 1];
  if (ch === '|' && next === '|') { tokens.push('||'); return true; }
  if (ch === '&' && next === '&') { tokens.push('&&'); return true; }
  if (ch === '+' && next === '=') { tokens.push('+='); return true; }
  return false;
}

function getMultiCharLen(token: string): number {
  return token.length;
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
  return '+-*/()=;{}'.includes(ch);
}

function isAssignment(tokens: string[], pos: number): boolean {
  return isAssignable(tokens, pos) && tokens[pos + 1] === '=';
}

function isCompoundAssignment(tokens: string[], pos: number): boolean {
  return isAssignable(tokens, pos) && tokens[pos + 1] === '+=';
}

function isAssignable(tokens: string[], pos: number): boolean {
  if (pos >= tokens.length) return false;
  const nextPos = pos + 1;
  if (tokens[pos] === 'let' || tokens[pos] === 'mut' || tokens[pos] === 'true' || tokens[pos] === 'false' || tokens[pos] === 'if' || tokens[pos] === 'else') return false;
  return /[a-zA-Z_]/.test(tokens[pos]!) && nextPos < tokens.length;
}

function parseExpression(tokens: string[], ctx: Ctx): number {
  let left = parseTerm(tokens, ctx);
  while (ctx.pos < tokens.length && (tokens[ctx.pos] === '+' || tokens[ctx.pos] === '-')) {
    const op = tokens[ctx.pos]!;
    ctx.pos++;
    const right = parseTerm(tokens, ctx);
    left = op === '+' ? left + right : left - right;
  }
  return left;
}

function parseTerm(tokens: string[], ctx: Ctx): number {
  let left = parseFactor(tokens, ctx);
  while (ctx.pos < tokens.length && (tokens[ctx.pos] === '*' || tokens[ctx.pos] === '/')) {
    const op = tokens[ctx.pos]!;
    ctx.pos++;
    const right = parseFactor(tokens, ctx);
    left = op === '*' ? left * right : left / right;
  }
  return left;
}

function parseFactor(tokens: string[], ctx: Ctx): number {
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
  if (token === 'true') {
    ctx.pos++;
    return 1;
  }
  if (token === 'false') {
    ctx.pos++;
    return 0;
  }
  if (/[a-zA-Z_]/.test(token)) {
    ctx.pos++;
    const value = lookupValue(token, ctx);
    if (value !== undefined) return value;
    throw new Error(`undefined identifier: ${token}`);
  }
  ctx.pos++;
  return parseInt(token, 10);
}

function lookupValue(name: string, ctx: Ctx): number | undefined {
  for (let i = ctx.scopes.length - 1; i >= 0; i--) {
    if (ctx.scopes[i]!.env[name] !== undefined) return ctx.scopes[i]!.env[name];
  }
  return undefined;
}
