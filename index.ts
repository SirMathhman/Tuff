type Token = { type: string; value: string };

type Value = { tag: "number"; num: number } | { tag: "bool"; val: boolean };

function num(v: number): Value { return { tag: "number", num: v }; }
function bool(v: boolean): Value { return { tag: "bool", val: v }; }
function toNum(v: Value): number { return v.tag === "number" ? v.num : v.val ? 1 : 0; }
function truthy(v: Value): boolean { return toNum(v) !== 0; }
function eq(a: Value, b: Value): Value {
  if (a.tag !== b.tag) return bool(false);
  if (a.tag === "number") return bool(a.num === (b as Value & { tag: "number" }).num);
  return bool(a.val === (b as Value & { tag: "bool" }).val);
}
function ne(a: Value, b: Value): Value { return bool(!truthy(eq(a, b))); }
function lt(a: Value, b: Value): Value { return bool(toNum(a) < toNum(b)); }
function lte(a: Value, b: Value): Value { return bool(toNum(a) <= toNum(b)); }
function gt(a: Value, b: Value): Value { return bool(toNum(a) > toNum(b)); }
function gte(a: Value, b: Value): Value { return bool(toNum(a) >= toNum(b)); }
function notOp(v: Value): Value { return bool(!truthy(v)); }
function negate(v: Value): Value { return num(-toNum(v)); }

// AST types
type Ast =
  | { kind: "num"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "ident"; name: string }
  | { kind: "unary"; op: "!" | "-"; operand: Ast }
  | { kind: "binop"; op: string; left: Ast; right: Ast }
  | { kind: "let"; mutable: boolean; name: string; value: Ast }
  | { kind: "assign"; name: string; value: Ast }
  | { kind: "block"; statements: (Ast | null)[] }
  | { kind: "paren"; expr: Ast }
  | { kind: "if"; cond: Ast; thenBranch: Ast; elseBranch: Ast };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i]!)) { i++; continue; }
    if (/[0-9.]/.test(source[i]!)) {
      let num = "";
      while (i < source.length && /[0-9.]/.test(source[i]!)) { num += source[i]!; i++; }
      tokens.push({ type: "number", value: num });
      continue;
    }
    if (/[a-zA-Z_]/.test(source[i]!)) {
      let ident = "";
      while (i < source.length && /[a-zA-Z_0-9]/.test(source[i]!)) { ident += source[i]!; i++; }
      tokens.push({ type: ident === "let" || ident === "mut" || ident === "if" || ident === "else" ? "keyword" : "identifier", value: ident });
      continue;
    }
    if (source[i] === "<" && source[i + 1] === "=") {
      tokens.push({ type: "punct", value: "<=" });
      i += 2;
      continue;
    }
    if (source[i] === ">" && source[i + 1] === "=") {
      tokens.push({ type: "punct", value: ">=" });
      i += 2;
      continue;
    }
    if (source[i] === "!" && source[i + 1] === "=") {
      tokens.push({ type: "punct", value: "!=" });
      i += 2;
      continue;
    }
    if (source[i] === "=" && source[i + 1] === "=") {
      tokens.push({ type: "punct", value: "==" });
      i += 2;
      continue;
    }
    if (source[i] === "<") {
      tokens.push({ type: "punct", value: "<" });
      i++;
      continue;
    }
    if (source[i] === ">") {
      tokens.push({ type: "punct", value: ">" });
      i++;
      continue;
    }
    if (source[i] === "|" && source[i + 1] === "|") {
      tokens.push({ type: "punct", value: "||" });
      i += 2;
      continue;
    }
    if (source[i] === "&" && source[i + 1] === "&") {
      tokens.push({ type: "punct", value: "&&" });
      i += 2;
      continue;
    }
    tokens.push({ type: "punct", value: source[i]! });
    i++;
  }
  return tokens;
}

// Parser — returns AST, does not evaluate
function parse(tokens: Token[]): Ast {
  let pos = 0;
  function expectToken(value: string): void {
    const tok = tokens[pos];
    if (!tok || tok.value !== value) throw new Error(`expected "${value}", got "${tok?.value ?? "EOF"}"`);
    pos++;
  }
  function parseExpression(): Ast {
    let result = parseOr();
    while (tokens[pos]?.value === "+" || tokens[pos]?.value === "-") {
      const op = tokens[pos]!.value;
      pos++;
      const next = parseOr();
      result = { kind: "binop", op, left: result, right: next };
    }
    return result;
  }
  function parseOr(): Ast {
    let result = parseAnd();
    while (tokens[pos]?.value === "||") {
      pos++;
      const next = parseAnd();
      result = { kind: "binop", op: "||", left: result, right: next };
    }
    return result;
  }
  function parseAnd(): Ast {
    let result = parseComparison();
    while (tokens[pos]?.value === "&&") {
      pos++;
      const next = parseComparison();
      result = { kind: "binop", op: "&&", left: result, right: next };
    }
    return result;
  }
  function parseComparison(): Ast {
    let result = parseTerm();
    while (true) {
      const op = tokens[pos]?.value;
      if (op === "==" || op === "!=" || op === "<" || op === "<=" || op === ">" || op === ">=") {
        pos++;
        const next = parseTerm();
        result = { kind: "binop", op, left: result, right: next };
      } else {
        break;
      }
    }
    return result;
  }
  function parseTerm(): Ast {
    let result = parseFactor();
    while (tokens[pos]?.value === "*" || tokens[pos]?.value === "/") {
      const op = tokens[pos]!.value;
      pos++;
      const next = parseFactor();
      result = { kind: "binop", op, left: result, right: next };
    }
    return result;
  }
  function parseFactor(): Ast {
    const tok = tokens[pos];
    if (tok?.value === "!") {
      pos++;
      return { kind: "unary", op: "!", operand: parseFactor() };
    }
    if (tok?.value === "-") {
      pos++;
      return { kind: "unary", op: "-", operand: parseFactor() };
    }
    return parsePrimary();
  }
  function parsePrimary(): Ast {
    const tok = tokens[pos];
    if (tok?.value === "(") {
      pos++;
      const result = parseExpression();
      pos++; // skip ")"
      return { kind: "paren", expr: result };
    }
    if (tok?.value === "{") {
      return parseBlock();
    }
    if (tok?.value === "if") {
      pos++; // skip "if"
      expectToken("(");
      const cond = parseExpression();
      expectToken(")");
      const thenBranch = parseExpression();
      expectToken("else");
      const elseBranch = parseExpression();
      return { kind: "if", cond, thenBranch, elseBranch };
    }
    if (tok?.value === "true") {
      pos++;
      return { kind: "bool", value: true };
    }
    if (tok?.value === "false") {
      pos++;
      return { kind: "bool", value: false };
    }
    if (tok?.type === "identifier") {
      pos++;
      return { kind: "ident", name: tok.value };
    }
    const result = parseFloat(tok!.value);
    pos++;
    return { kind: "num", value: result };
  }
  function parseStatement(): Ast | null {
    if (tokens[pos]?.value === "let") {
      pos++;
      const mutable = tokens[pos]?.value === "mut";
      if (mutable) pos++;
      const name = tokens[pos]!.value;
      pos++;
      pos++; // skip "="
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "let", mutable, name, value };
    }
    // Check for assignment: identifier = expression
    if (tokens[pos]?.type === "identifier" && tokens[pos + 1]?.value === "=") {
      const name = tokens[pos]!.value;
      pos++; // skip identifier
      pos++; // skip "="
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "assign", name, value };
    }
    const result = parseExpression();
    if (tokens[pos]?.value === ";") pos++;
    return result;
  }
  function parseBlock(): Ast {
    pos++; // skip "{"
    const statements: (Ast | null)[] = [];
    while (tokens[pos]?.value !== "}" && tokens[pos]) {
      statements.push(parseStatement());
    }
    pos++; // skip "}"
    return { kind: "block", statements };
  }
  const statements: (Ast | null)[] = [];
  while (tokens[pos]) {
    statements.push(parseStatement());
  }
  if (statements.length === 0) return { kind: "num", value: 0 };
  if (statements.length === 1) return statements[0]! ?? { kind: "num", value: 0 };
  return { kind: "block", statements };
}

// Evaluator — walks AST with scope
type Scope = { vars: Record<string, Value>; mutable: Record<string, boolean> };

function evalAst(ast: Ast, scopes: Scope[], mutables: Scope["mutable"][]): Value {
  function lookup(name: string): Value {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (name in scopes[i]!.vars) return scopes[i]!.vars[name]!;
    }
    throw new Error(`undeclared variable: ${name}`);
  }
  function isMutable(name: string): boolean {
    for (let i = mutables.length - 1; i >= 0; i--) {
      if (name in mutables[i]!) return mutables[i]![name]!;
    }
    return false;
  }
  function visit(node: Ast): Value | null {
    switch (node.kind) {
      case "num": return num(node.value);
      case "bool": return bool(node.value);
      case "ident": return lookup(node.name);
      case "unary": {
        const v = visit(node.operand)!;
        return node.op === "!" ? notOp(v) : negate(v);
      }
      case "binop": {
        const l = visit(node.left)!;
        const r = visit(node.right)!;
        return applyBinOp(node.op, l, r);
      }
      case "let": {
        const v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        scopes[scopes.length - 1]!.vars[node.name] = v;
        if (node.mutable) mutables[mutables.length - 1]![node.name] = true;
        return null;
      }
      case "assign": {
        if (!isMutable(node.name)) throw new Error(`cannot assign to immutable variable: ${node.name}`);
        const v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        // Find the scope where the variable is declared
        for (let i = scopes.length - 1; i >= 0; i--) {
          if (node.name in scopes[i]!.vars) {
            scopes[i]!.vars[node.name] = v;
            break;
          }
        }
        return null;
      }
      case "block": {
        scopes.push({ vars: {}, mutable: {} });
        mutables.push({});
        let value: Value | null = null;
        for (const stmt of node.statements) {
          if (stmt) value = visit(stmt);
        }
        scopes.pop();
        mutables.pop();
        return value;
      }
      case "paren": return visit(node.expr);
      case "if": {
        const cond = visit(node.cond)!;
        if (truthy(cond)) return visit(node.thenBranch);
        return visit(node.elseBranch);
      }
    }
  }
  return visit(ast) ?? num(0);
}

function applyBinOp(op: string, left: Value, right: Value): Value {
  switch (op) {
    case "+": return num(toNum(left) + toNum(right));
    case "-": return num(toNum(left) - toNum(right));
    case "*": return num(toNum(left) * toNum(right));
    case "/": return num(toNum(left) / toNum(right));
    case "||": return bool(truthy(left) || truthy(right));
    case "&&": return bool(truthy(left) && truthy(right));
    case "==": return eq(left, right);
    case "!=": return ne(left, right);
    case "<": return lt(left, right);
    case "<=": return lte(left, right);
    case ">": return gt(left, right);
    case ">=": return gte(left, right);
    default: throw new Error(`unknown operator: ${op}`);
  }
}

export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;
  const tokens = tokenize(trimmed);
  const ast = parse(tokens);
  const value = evalAst(ast, [{ vars: {}, mutable: {} }], [{}]);
  return toNum(value);
}
