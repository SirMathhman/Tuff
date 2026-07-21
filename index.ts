// ── AST Types ──────────────────────────────────────────────────────────────

interface Program {
  type: 'Program';
  body: Statement[];
}

type Statement = ExprStatement | LetStatement | AssignStatement | CompoundAssignStatement | BlockStatement | IfStatement | WhileStatement;

interface ExprStatement {
  type: 'ExprStatement';
  expression: Expr;
}

interface LetStatement {
  type: 'LetStatement';
  mutable: boolean;
  name: string;
  typeAnnotation: string | null;
  value: Expr;
}

interface AssignStatement {
  type: 'AssignStatement';
  name: string;
  value: Expr;
}

interface CompoundAssignStatement {
  type: 'CompoundAssignStatement';
  name: string;
  op: string;
  value: Expr;
}

interface BlockStatement {
  type: 'BlockStatement';
  body: Statement[];
}

interface IfStatement {
  type: 'IfStatement';
  condition: Expr;
  thenBranch: Statement;
  elseBranch: Statement | null;
}

interface WhileStatement {
  type: 'WhileStatement';
  condition: Expr;
  body: Statement;
}

type Expr = BinaryExpr | NumberLiteral | Identifier | BooleanLiteral;

interface BinaryExpr {
  type: 'BinaryExpr';
  left: Expr;
  op: string;
  right: Expr;
}

interface NumberLiteral {
  type: 'NumberLiteral';
  value: number;
  typeAnnotation: string | null;
}

interface Identifier {
  type: 'Identifier';
  name: string;
}

interface BooleanLiteral {
  type: 'BooleanLiteral';
  value: boolean;
}

// ── Scope ──────────────────────────────────────────────────────────────────

type Scope = { env: Record<string, number>; mutable: Set<string> };

// ── Entry Point ────────────────────────────────────────────────────────────

export function interpret(source: string): number {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const scopes: Scope[] = [{ env: {}, mutable: new Set() }];
  return evaluateProgram(ast, scopes);
}

// ── Evaluator ──────────────────────────────────────────────────────────────

function evaluateProgram(node: Program, scopes: Scope[]): number {
  let result = 0;
  for (const stmt of node.body) {
    result = evaluateStatement(stmt, scopes);
  }
  return result;
}

function evaluateStatement(node: Statement, scopes: Scope[]): number {
  switch (node.type) {
    case 'ExprStatement': return evalExprStmt(node, scopes);
    case 'LetStatement': return evalLet(node, scopes);
    case 'AssignStatement': return evalAssign(node, scopes);
    case 'CompoundAssignStatement': return evalCompoundAssign(node, scopes);
    case 'BlockStatement': return evalBlock(node, scopes);
    case 'IfStatement': return evalIf(node, scopes);
    case 'WhileStatement': return evalWhile(node, scopes);
  }
}

function evalExprStmt(node: ExprStatement, scopes: Scope[]): number {
  return evaluateExpr(node.expression, scopes);
}

function evalLet(node: LetStatement, scopes: Scope[]): number {
  const value = evaluateExpr(node.value, scopes);
  validateTypeRange(value, node.typeAnnotation);
  const scope = scopes[scopes.length - 1]!;
  scope.env[node.name] = value;
  if (node.mutable) scope.mutable.add(node.name);
  return 0;
}

function evalAssign(node: AssignStatement, scopes: Scope[]): number {
  const scope = validateMutableTarget(node.name, scopes);
  const value = evaluateExpr(node.value, scopes);
  scope.env[node.name] = value;
  return 0;
}

function evalCompoundAssign(node: CompoundAssignStatement, scopes: Scope[]): number {
  const scope = validateMutableTarget(node.name, scopes);
  const value = evaluateExpr(node.value, scopes);
  if (node.op === '+=') {
    scope.env[node.name] = scope.env[node.name]! + value;
  }
  return 0;
}

function evalBlock(node: BlockStatement, scopes: Scope[]): number {
  scopes.push({ env: {}, mutable: new Set() });
  let result = 0;
  for (const stmt of node.body) {
    result = evaluateStatement(stmt, scopes);
  }
  scopes.pop();
  return result;
}

function evalIf(node: IfStatement, scopes: Scope[]): number {
  const condition = evaluateExpr(node.condition, scopes);
  if (condition) {
    return evaluateStatement(node.thenBranch, scopes);
  } else if (node.elseBranch) {
    return evaluateStatement(node.elseBranch, scopes);
  }
  return 0;
}

function evalWhile(node: WhileStatement, scopes: Scope[]): number {
  while (evaluateExpr(node.condition, scopes)) {
    evaluateStatement(node.body, scopes);
  }
  return 0;
}

function validateMutableTarget(name: string, scopes: Scope[]): Scope {
  if (!lookup(name, scopes)) {
    throw new Error(`undefined identifier: ${name}`);
  }
  const scope = findScope(name, scopes);
  if (!scope || !scope.mutable.has(name)) {
    throw new Error(`cannot assign to immutable variable: ${name}`);
  }
  return scope;
}

function evaluateExpr(node: Expr, scopes: Scope[]): number {
  switch (node.type) {
    case 'NumberLiteral': return node.value;
    case 'BooleanLiteral': return node.value ? 1 : 0;
    case 'Identifier': {
      const value = lookupValue(node.name, scopes);
      if (value !== undefined) return value;
      throw new Error(`undefined identifier: ${node.name}`);
    }
    case 'BinaryExpr': return evalBinary(node, scopes);
  }
}

function evalBinary(node: BinaryExpr, scopes: Scope[]): number {
  const left = evaluateExpr(node.left, scopes);
  const right = evaluateExpr(node.right, scopes);
  return applyOp(node.op, left, right);
}

function applyOp(op: string, left: number, right: number): number {
  if (op === '+') return left + right;
  if (op === '-') return left - right;
  if (op === '*') return left * right;
  if (op === '/') return left / right;
  if (op === '||') return left || right;
  if (op === '&&') return left && right;
  return compareOp(op, left, right);
}

function compareOp(op: string, left: number, right: number): number {
  if (op === '<') return left < right ? 1 : 0;
  if (op === '>') return left > right ? 1 : 0;
  if (op === '<=') return left <= right ? 1 : 0;
  if (op === '>=') return left >= right ? 1 : 0;
  return compareEquality(op, left, right);
}

function compareEquality(op: string, left: number, right: number): number {
  if (op === '==') return left == right ? 1 : 0;
  if (op === '!=') return left != right ? 1 : 0;
  throw new Error(`unknown operator: ${op}`);
}

// ── Parser ─────────────────────────────────────────────────────────────────

interface Parser {
  tokens: string[];
  pos: number;
}

function parse(tokens: string[]): Program {
  const parser: Parser = { tokens, pos: 0 };
  const body: Statement[] = [];

  while (parser.pos < tokens.length) {
    body.push(parseStatement(parser));
  }

  return { type: 'Program', body };
}

function parseStatement(p: Parser): Statement {
  if (p.pos >= p.tokens.length) {
    return { type: 'ExprStatement', expression: { type: 'NumberLiteral', value: 0, typeAnnotation: null } };
  }

  const token = p.tokens[p.pos]!;

  if (token === 'let') return parseLet(p);
  if (token === '{') return parseBlock(p);
  if (token === 'if') return parseIf(p);
  if (token === 'while') return parseWhile(p);
  if (token === 'else') return parseElse(p);
  if (isAssignable(p, p.pos)) return parseAssign(p);
  return parseExprStmt(p);
}

function parseLet(p: Parser): LetStatement {
  p.pos++; // 'let'
  const mutable = p.tokens[p.pos] === 'mut';
  if (mutable) p.pos++;
  const name = p.tokens[p.pos]!;
  p.pos++; // name
  const typeAnn = parseTypeAnnotation(p);
  if (typeAnn) p.pos++; // skip type annotation
  p.pos++; // '='
  const value = parseOrExpression(p);
  if (p.tokens[p.pos] === ';') p.pos++;
  return { type: 'LetStatement', mutable, name, typeAnnotation: typeAnn, value };
}

function parseTypeAnnotation(p: Parser): string | null {
  if (p.tokens[p.pos] === ':') {
    p.pos++; // skip ':'
    const typeToken = p.tokens[p.pos]!;
    return typeToken;
  }
  return null;
}

function parseBlock(p: Parser): BlockStatement {
  p.pos++; // '{'
  const body: Statement[] = [];
  while (p.pos < p.tokens.length && p.tokens[p.pos] !== '}') {
    body.push(parseStatement(p));
  }
  if (p.tokens[p.pos] === '}') p.pos++;
  return { type: 'BlockStatement', body };
}

function parseIf(p: Parser): IfStatement {
  p.pos++; // 'if'
  p.pos++; // '('
  const condition = parseOrExpression(p);
  if (p.tokens[p.pos] === ')') p.pos++;
  const thenBranch = parseStatement(p);
  let elseBranch: Statement | null = null;
  if (p.tokens[p.pos] === 'else') {
    p.pos++;
    elseBranch = parseStatement(p);
  }
  return { type: 'IfStatement', condition, thenBranch, elseBranch };
}

function parseWhile(p: Parser): WhileStatement {
  p.pos++; // 'while'
  p.pos++; // '('
  const condition = parseOrExpression(p);
  if (p.tokens[p.pos] === ')') p.pos++;
  const body = parseStatement(p);
  return { type: 'WhileStatement', condition, body };
}

function parseElse(p: Parser): ExprStatement {
  p.pos++;
  return { type: 'ExprStatement', expression: { type: 'NumberLiteral', value: 0, typeAnnotation: null } };
}

function parseAssign(p: Parser): AssignStatement | CompoundAssignStatement {
  const name = p.tokens[p.pos]!;
  p.pos++; // name
  const op = p.tokens[p.pos]!;
  p.pos++; // operator
  const value = parseOrExpression(p);
  if (p.tokens[p.pos] === ';') p.pos++;
  if (op === '+=') {
    return { type: 'CompoundAssignStatement', name, op, value };
  }
  return { type: 'AssignStatement', name, value };
}

function parseExprStmt(p: Parser): ExprStatement {
  const expr = parseOrExpression(p);
  if (p.tokens[p.pos] === ';') p.pos++;
  return { type: 'ExprStatement', expression: expr };
}

function isAssignable(p: Parser, pos: number): boolean {
  if (pos >= p.tokens.length) return false;
  const nextPos = pos + 1;
  const token = p.tokens[pos]!;
  if (isKeyword(token)) return false;
  return /[a-zA-Z_]/.test(token) && nextPos < p.tokens.length && isAssignOp(p.tokens[nextPos]);
}

function isKeyword(token: string): boolean {
  return token === 'let' || token === 'mut' || token === 'true' || token === 'false' || token === 'if' || token === 'else' || token === 'while';
}

function isAssignOp(token: string | undefined): boolean {
  return token === '=' || token === '+=';
}

// ── Expression Parser (precedence climbing) ────────────────────────────────

const precedence: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '<': 3, '<=': 3, '>': 3, '>=': 3, '==': 3, '!=': 3,
  '+': 4, '-': 4,
  '*': 5, '/': 5,
};

function parseOrExpression(p: Parser): Expr {
  return parseExpression(p, 0);
}

function parseExpression(p: Parser, minPrec: number): Expr {
  let left = parseFactor(p);

  while (p.pos < p.tokens.length) {
    const op = p.tokens[p.pos]!;
    const prec = precedence[op];
    if (prec === undefined || prec <= minPrec) break;
    p.pos++;
    const right = parseExpression(p, prec);
    left = { type: 'BinaryExpr', left, op, right };
  }

  return left;
}

function parseFactor(p: Parser): Expr {
  if (p.pos >= p.tokens.length) return { type: 'NumberLiteral', value: 0, typeAnnotation: null };
  const token = p.tokens[p.pos]!;

  if (token === '(') {
    p.pos++;
    const expr = parseOrExpression(p);
    if (p.tokens[p.pos] === ')') p.pos++;
    return expr;
  }

  if (token === 'true') {
    p.pos++;
    return { type: 'BooleanLiteral', value: true };
  }

  if (token === 'false') {
    p.pos++;
    return { type: 'BooleanLiteral', value: false };
  }

  if (/\d/.test(token[0]!)) {
    const numVal = parseInt(token, 10);
    const typeAnn = readTypeAnnotation(token);
    validateTypeRange(numVal, typeAnn);
    p.pos++;
    return { type: 'NumberLiteral', value: numVal, typeAnnotation: typeAnn };
  }

  if (/[a-zA-Z_]/.test(token)) {
    p.pos++;
    return { type: 'Identifier', name: token };
  }

  // Fallback: plain number
  p.pos++;
  return { type: 'NumberLiteral', value: parseInt(token, 10), typeAnnotation: null };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function lookup(name: string, scopes: Scope[]): boolean {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i]!.env[name] !== undefined) return true;
  }
  return false;
}

function findScope(name: string, scopes: Scope[]): Scope | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i]!.env[name] !== undefined) return scopes[i]!;
  }
  return null;
}

function lookupValue(name: string, scopes: Scope[]): number | undefined {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i]!.env[name] !== undefined) return scopes[i]!.env[name];
  }
  return undefined;
}

// ── Tokenizer ──────────────────────────────────────────────────────────────

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/\d/.test(ch)) {
      const numEnd = skipDigits(source, i);
      const annEnd = skipTypeAnnotation(source, numEnd);
      tokens.push(source.slice(i, annEnd));
      i = annEnd;
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
  if (isLogicalOp(ch, next)) { tokens.push(ch + next); return true; }
  if (isAssignCompound(ch, next)) { tokens.push(ch + next); return true; }
  if (isCompareCompound(ch, next)) { tokens.push(ch + next); return true; }
  return false;
}

function isLogicalOp(ch: string, next: string | undefined): boolean {
  return (ch === '|' && next === '|') || (ch === '&' && next === '&');
}

function isAssignCompound(ch: string, next: string | undefined): boolean {
  return ch === '+' && next === '=';
}

function isCompareCompound(ch: string, next: string | undefined): boolean {
  return (ch === '<' && next === '=') || (ch === '>' && next === '=') || (ch === '!' && next === '=') || (ch === '=' && next === '=');
}

function getMultiCharLen(token: string): number {
  return token.length;
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

function skipTypeAnnotation(source: string, start: number): number {
  let i = start;
  if (i < source.length && source[i] === 'U') {
    i++;
    while (i < source.length && /\d/.test(source[i]!)) i++;
  }
  return i;
}

function isOperator(ch: string): boolean {
  return '+-*/()=;{}<>=!:'.includes(ch);
}

function readTypeAnnotation(token: string): string | null {
  const match = token.match(/^(\d+)(U\d+)$/);
  return match ? (match[2] ?? null) : null;
}

function validateTypeRange(value: number, typeAnn: string | null): void {
  if (typeAnn === null) return;
  validateUnsigned(value, typeAnn);
}

function validateUnsigned(value: number, typeAnn: string): void {
  if (typeAnn === 'U8' && (value < 0 || value > 255)) {
    throw new Error(`value ${value} out of range for U8 (0-255)`);
  }
  if (typeAnn === 'U16' && (value < 0 || value > 65535)) {
    throw new Error(`value ${value} out of range for U16 (0-65535)`);
  }
  if (typeAnn === 'U32' && (value < 0 || value > 4294967295)) {
    throw new Error(`value ${value} out of range for U32 (0-4294967295)`);
  }
}
