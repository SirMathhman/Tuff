type Token = { type: string; value: string };

type Value =
  | { tag: "number"; num: number }
  | { tag: "bool"; val: boolean }
  | { tag: "fn"; params: string[]; body: Ast; scopes: Scope[]; mutables: Scope["mutable"][] }
  | { tag: "ref"; scope: Scope; name: string; mutable: boolean }
  | { tag: "tuple"; values: Value[] }
  | { tag: "null" }
  | { tag: "array"; values: Value[] };

function num(v: number): Value { return { tag: "number", num: v }; }
function bool(v: boolean): Value { return { tag: "bool", val: v }; }
function toNum(v: Value): number {
  if (v.tag === "number") return v.num;
  if (v.tag === "bool") return v.val ? 1 : 0;
  if (v.tag === "ref") return toNum(v.scope.vars[v.name]!);
  if (v.tag === "tuple") return 0;
  if (v.tag === "null") return 0;
  if (v.tag === "array") return 0;
  return 0;
}
function truthy(v: Value): boolean { return toNum(v) !== 0; }
function eq(a: Value, b: Value): Value {
  if (a.tag !== b.tag) return bool(false);
  if (a.tag === "number") return bool(a.num === (b as Value & { tag: "number" }).num);
  if (a.tag === "bool") return bool(a.val === (b as Value & { tag: "bool" }).val);
  return bool(false);
}
function ne(a: Value, b: Value): Value { return bool(!truthy(eq(a, b))); }
function lt(a: Value, b: Value): Value { return bool(toNum(a) < toNum(b)); }
function lte(a: Value, b: Value): Value { return bool(toNum(a) <= toNum(b)); }
function gt(a: Value, b: Value): Value { return bool(toNum(a) > toNum(b)); }
function gte(a: Value, b: Value): Value { return bool(toNum(a) >= toNum(b)); }
function notOp(v: Value): Value { return bool(!truthy(v)); }
function negate(v: Value): Value { return num(-toNum(v)); }
type ControlFlow =
  | { kind: "continue" }
  | { kind: "break" }
  | { kind: "yield"; value: Value };

function isControlFlow(e: unknown): e is ControlFlow {
  return typeof e === "object" && e !== null && "kind" in e;
}

// AST types
type Ast =
  | { kind: "num"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "ident"; name: string }
  | { kind: "unary"; op: "!" | "-" | "&" | "&mut" | "*"; operand: Ast }
  | { kind: "tuple"; elements: Ast[] }
  | { kind: "index"; target: Ast; index: number }
  | { kind: "binop"; op: string; left: Ast; right: Ast }
  | { kind: "let"; mutable: boolean; name: string; value: Ast }
  | { kind: "assign"; name: string; value: Ast }
  | { kind: "refassign"; name: string; value: Ast }
  | { kind: "block"; statements: (Ast | null)[] }
  | { kind: "paren"; expr: Ast }
  | { kind: "if_expr"; cond: Ast; thenBranch: Ast; elseBranch: Ast }
  | { kind: "if_stmt"; cond: Ast; thenBranch: Ast; elseBranch: Ast | null }
  | { kind: "augassign"; name: string; op: "+" | "-" | "*" | "/"; value: Ast }
  | { kind: "while"; cond: Ast; body: Ast }
  | { kind: "for"; varName: string; start: Ast; end: Ast; body: Ast }
  | { kind: "continue" }
  | { kind: "break" }
  | { kind: "yield"; value: Ast }
  | { kind: "fn"; name: string; params: string[]; body: Ast }
  | { kind: "call"; name: string; args: Ast[] }
  | { kind: "match"; expr: Ast; cases: { pattern: Ast; body: Ast }[] }
  | { kind: "wildcard" }
  | { kind: "null" }
  | { kind: "array"; elements: Ast[] }
  | { kind: "array_index"; target: Ast; index: Ast }
  | { kind: "char"; value: string };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i]!)) { i++; continue; }
    if (/[0-9]/.test(source[i]!)) {
      let numStr = "";
      while (i < source.length && /[0-9]/.test(source[i]!)) { numStr += source[i]!; i++; }
      // Handle decimal point
      if (i < source.length && source[i] === "." && i + 1 < source.length && /[0-9]/.test(source[i + 1]!)) {
        numStr += source[i]!;
        i++;
        while (i < source.length && /[0-9]/.test(source[i]!)) { numStr += source[i]!; i++; }
      }
      tokens.push({ type: "number", value: numStr });
      continue;
    }
    if (source[i] === ".") {
      if (source[i + 1] === ".") {
        tokens.push({ type: "punct", value: ".." });
        i += 2;
        continue;
      }
      tokens.push({ type: "punct", value: "." });
      i++;
      continue;
    }
    if (source[i] === "'") {
      i++; // skip opening quote
      let ch = "";
      while (i < source.length && source[i] !== "'") { ch += source[i]!; i++; }
      i++; // skip closing quote
      tokens.push({ type: "char", value: ch });
      continue;
    }
    if (/[a-zA-Z_]/.test(source[i]!)) {
      let ident = "";
      while (i < source.length && /[a-zA-Z_0-9]/.test(source[i]!)) { ident += source[i]!; i++; }
      tokens.push({ type: ident === "let" || ident === "mut" || ident === "if" || ident === "else" || ident === "while" || ident === "for" || ident === "in" || ident === "continue" || ident === "break" || ident === "yield" || ident === "fn" || ident === "match" || ident === "case" || ident === "null" ? "keyword" : "identifier", value: ident });
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
    if (source[i] === "=" && source[i + 1] === ">") {
      tokens.push({ type: "punct", value: "=>" });
      i += 2;
      continue;
    }
    if (source[i] === "!" && source[i + 1] === "=") {
      tokens.push({ type: "punct", value: "!=" });
      i += 2;
      continue;
    }
    if (source[i] === "+" && source[i + 1] === "=") {
      tokens.push({ type: "punct", value: "+=" });
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
    if (tok?.value === "&") {
      pos++;
      if (tokens[pos]?.value === "mut") {
        pos++;
        return { kind: "unary", op: "&mut", operand: parseFactor() };
      }
      return { kind: "unary", op: "&", operand: parseFactor() };
    }
    if (tok?.value === "*") {
      pos++;
      return { kind: "unary", op: "*", operand: parseFactor() };
    }
    return parsePrimary();
  }
  function parsePrimary(): Ast {
    const tok = tokens[pos];
    if (tok?.value === "(") {
      pos++;
      // Check if this is a tuple (contains commas) or a parenthesized expression
      // Look ahead to see if there's a comma before the closing paren
      let depth = 1;
      let j = pos;
      let hasComma = false;
      while (depth > 0 && tokens[j]) {
        if (tokens[j]!.value === "(") depth++;
        else if (tokens[j]!.value === ")") depth--;
        else if (tokens[j]!.value === "," && depth === 1) hasComma = true;
        j++;
      }
      if (hasComma) {
        // Parse as tuple
        const elements: Ast[] = [];
        while (tokens[pos]?.value !== ")") {
          elements.push(parseExpression());
          if (tokens[pos]?.value === ",") pos++;
        }
        pos++; // skip ")"
        return { kind: "tuple", elements };
      }
      const result = parseExpression();
      pos++; // skip ")"
      return { kind: "paren", expr: result };
    }
    if (tok?.value === "{") {
      return parseBlock();
    }
    if (tok?.value === "[") {
      pos++; // skip "["
      const elements: Ast[] = [];
      while (tokens[pos]?.value !== "]") {
        elements.push(parseExpression());
        if (tokens[pos]?.value === ",") pos++;
      }
      pos++; // skip "]"
      return { kind: "array", elements };
    }
    if (tok?.value === "if") {
      pos++; // skip "if"
      expectToken("(");
      const cond = parseExpression();
      expectToken(")");
      const thenBranch = parseExpression();
      expectToken("else");
      const elseBranch = parseExpression();
      return { kind: "if_expr", cond, thenBranch, elseBranch };
    }
    if (tok?.value === "match") {
      pos++; // skip "match"
      expectToken("(");
      const expr = parseExpression();
      expectToken(")");
      expectToken("{");
      const cases: { pattern: Ast; body: Ast }[] = [];
      while (tokens[pos]?.value !== "}") {
        expectToken("case");
        const pattern = tokens[pos]?.value === "_" ? (pos++, { kind: "wildcard" } as Ast) : parseExpression();
        expectToken("=>");
        const body = parseExpression();
        cases.push({ pattern, body });
        if (tokens[pos]?.value === ";") pos++;
      }
      pos++; // skip "}"
      return { kind: "match", expr, cases };
    }
    if (tok?.value === "true") {
      pos++;
      return { kind: "bool", value: true };
    }
    if (tok?.value === "false") {
      pos++;
      return { kind: "bool", value: false };
    }
    if (tok?.value === "null") {
      pos++;
      return { kind: "null" };
    }
    if (tok?.type === "char") {
      pos++;
      return { kind: "char", value: tok.value };
    }
    if (tok?.type === "identifier") {      const name = tok.value;
      pos++;
      // Check for function call: identifier(args)
      if (tokens[pos]?.value === "(") {
        pos++; // skip "("
        const args: Ast[] = [];
        while (tokens[pos]?.value !== ")") {
          args.push(parseExpression());
          if (tokens[pos]?.value === ",") pos++;
        }
        pos++; // skip ")"
        return { kind: "call", name, args };
      }
      // Check for field access: identifier.index
      if (tokens[pos]?.value === ".") {
        pos++; // skip "."
        const index = parseInt(tokens[pos]!.value);
        pos++;
        return { kind: "index", target: { kind: "ident", name }, index };
      }
      // Check for array indexing: identifier[expr]
      if (tokens[pos]?.value === "[") {
        pos++; // skip "["
        const index = parseExpression();
        pos++; // skip "]"
        return { kind: "array_index", target: { kind: "ident", name }, index };
      }
      return { kind: "ident", name };
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
    // Check for augmented assignment: identifier += expression
    if (tokens[pos]?.type === "identifier" && tokens[pos + 1]?.value === "+=") {
      const name = tokens[pos]!.value;
      pos++; // skip identifier
      pos++; // skip "+="
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "augassign", name, op: "+", value };
    }
    // Check for dereference assignment: *identifier = expression
    if (tokens[pos]?.value === "*" && tokens[pos + 1]?.type === "identifier" && tokens[pos + 2]?.value === "=") {
      const name = tokens[pos + 1]!.value;
      pos++; // skip "*"
      pos++; // skip identifier
      pos++; // skip "="
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "refassign", name, value };
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
    // Check for continue statement
    if (tokens[pos]?.value === "continue") {
      pos++;
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "continue" };
    }
    // Check for break statement
    if (tokens[pos]?.value === "break") {
      pos++;
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "break" };
    }
    // Check for yield statement
    if (tokens[pos]?.value === "yield") {
      pos++;
      const value = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "yield", value };
    }
    // Check for fn statement
    if (tokens[pos]?.value === "fn") {
      pos++; // skip "fn"
      const name = tokens[pos]!.value;
      pos++; // skip name
      pos++; // skip "("
      const params: string[] = [];
      while (tokens[pos]?.value !== ")") {
        params.push(tokens[pos]!.value);
        pos++;
        if (tokens[pos]?.value === ",") pos++;
      }
      pos++; // skip ")"
      pos++; // skip "=>"
      const body = parseExpression();
      if (tokens[pos]?.value === ";") pos++;
      return { kind: "fn", name, params, body };
    }
    // Check for while statement
    if (tokens[pos]?.value === "while") {
      pos++; // skip "while"
      expectToken("(");
      const cond = parseExpression();
      expectToken(")");
      const body = parseStatement()!;
      return { kind: "while", cond, body };
    }
    // Check for for statement
    if (tokens[pos]?.value === "for") {
      pos++; // skip "for"
      expectToken("(");
      const varName = tokens[pos]!.value;
      pos++; // skip variable name
      expectToken("in");
      const start = parseExpression();
      expectToken("..");
      const end = parseExpression();
      expectToken(")");
      const body = parseStatement()!;
      return { kind: "for", varName, start, end, body };
    }
    // Check for if statement — branches are parsed as statements (fall back to expressions)
    if (tokens[pos]?.value === "if") {
      pos++; // skip "if"
      expectToken("(");
      const cond = parseExpression();
      expectToken(")");
      const thenBranch = parseStatement()!;
      const elseBranch = tokens[pos]?.value === "else" ? (pos++, parseStatement()) : null;
      return { kind: "if_stmt", cond, thenBranch, elseBranch };
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
  function setVar(name: string, value: Value): void {
    if (!isMutable(name)) throw new Error(`cannot assign to immutable variable: ${name}`);
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (name in scopes[i]!.vars) {
        scopes[i]!.vars[name] = value;
        return;
      }
    }
  }
  function visit(node: Ast): Value | null {
    switch (node.kind) {
      case "num": return num(node.value);
      case "bool": return bool(node.value);
      case "ident": return lookup(node.name);
      case "unary": {
        const v = visit(node.operand)!;
        if (node.op === "!") return notOp(v);
        if (node.op === "-") return negate(v);
        if (node.op === "&") {
          // Create a reference to the operand
          if (node.operand.kind === "ident") {
            const scope = scopes[scopes.length - 1]!;
            return { tag: "ref", scope, name: node.operand.name, mutable: false };
          }
          throw new Error("can only take reference of identifier");
        }
        if (node.op === "&mut") {
          // Create a mutable reference to the operand
          if (node.operand.kind === "ident") {
            const scope = scopes[scopes.length - 1]!;
            return { tag: "ref", scope, name: node.operand.name, mutable: true };
          }
          throw new Error("can only take reference of identifier");
        }
        if (node.op === "*") {
          // Dereference
          if (v.tag === "ref") return v.scope.vars[v.name]!;
          throw new Error("cannot dereference non-reference");
        }
        return v;
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
        const v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        setVar(node.name, v);
        return null;
      }
      case "refassign": {
        const ref = lookup(node.name);
        if (ref.tag !== "ref") throw new Error("not a reference");
        if (!ref.mutable) throw new Error("cannot assign through immutable reference");
        const v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        ref.scope.vars[ref.name] = v;
        return null;
      }
      case "augassign": {
        const v = visit(node.value);
        if (v === null) throw new Error("block has no value");
        const existing = lookup(node.name);
        setVar(node.name, applyBinOp(node.op, existing, v));
        return null;
      }
      case "block": {
        scopes.push({ vars: {}, mutable: {} });
        mutables.push({});
        let value: Value | null = null;
        try {
          for (const stmt of node.statements) {
            if (stmt) value = visit(stmt);
          }
        } catch (e) {
          if (isControlFlow(e) && e.kind === "yield") {
            scopes.pop();
            mutables.pop();
            return e.value;
          }
          throw e;
        }
        scopes.pop();
        mutables.pop();
        return value;
      }
      case "paren": return visit(node.expr);
      case "if_expr": {
        const cond = visit(node.cond)!;
        if (truthy(cond)) return visit(node.thenBranch);
        return visit(node.elseBranch);
      }
      case "if_stmt": {
        const cond = visit(node.cond)!;
        if (truthy(cond)) return visit(node.thenBranch);
        return node.elseBranch ? visit(node.elseBranch) : num(0);
      }
      case "while": {
        let iterations = 0;
        while (true) {
          if (iterations++ > 10000) throw new Error("infinite loop detected");
          try {
            if (!truthy(visit(node.cond)!)) break;
            visit(node.body);
          } catch (e) {
            if (isControlFlow(e)) {
              if (e.kind === "continue") continue;
              if (e.kind === "break") break;
            }
            throw e;
          }
        }
        return null;
      }
      case "for": {
        const startVal = toNum(visit(node.start)!);
        const endVal = toNum(visit(node.end)!);
        scopes.push({ vars: {}, mutable: {} });
        mutables.push({});
        scopes[scopes.length - 1]!.vars[node.varName] = num(0);
        mutables[mutables.length - 1]![node.varName] = true;
        let iterations = 0;
        try {
          for (let i = startVal; i < endVal; i++) {
            if (iterations++ > 10000) throw new Error("infinite loop detected");
            scopes[scopes.length - 1]!.vars[node.varName] = num(i);
            try {
              visit(node.body);
            } catch (e) {
              if (isControlFlow(e)) {
                if (e.kind === "continue") continue;
                if (e.kind === "break") break;
              }
              throw e;
            }
          }
        } finally {
          scopes.pop();
          mutables.pop();
        }
        return null;
      }
      case "continue": throw { kind: "continue" };
      case "break": throw { kind: "break" };
      case "yield": {
        const v = visit(node.value);
        if (v === null) throw new Error("yield has no value");
        throw { kind: "yield", value: v };
      }
      case "fn": {
        scopes[scopes.length - 1]!.vars[node.name] = {
          tag: "fn",
          params: node.params,
          body: node.body,
          scopes: [...scopes],
          mutables: [...mutables],
        };
        return null;
      }
      case "call": {
        const fn = lookup(node.name);
        if (fn.tag !== "fn") throw new Error("not a function");
        const fnScopes = [...fn.scopes, { vars: {}, mutable: {} }];
        const fnMutables = [...fn.mutables, {}];
        const argValues = node.args.map(a => {
          const v = visit(a);
          if (v === null) throw new Error("argument has no value");
          return v;
        });
        fn.params.forEach((p, i) => {
          fnScopes[fnScopes.length - 1]!.vars[p] = argValues[i]!;
        });
        const result = evalAst(fn.body, fnScopes, fnMutables);
        return result;
      }
      case "wildcard": return num(0);
      case "null": return { tag: "null" };
      case "char": return num(node.value.charCodeAt(0));
      case "match": {
        const matchVal = visit(node.expr)!;
        for (const c of node.cases) {
          if (c.pattern.kind === "wildcard") {
            return visit(c.body);
          }
          const patternVal = visit(c.pattern)!;
          if (toNum(eq(matchVal, patternVal)) === 1) {
            return visit(c.body);
          }
        }
        return num(0);
      }
      case "tuple": {
        const values = node.elements.map(e => {
          const v = visit(e);
          if (v === null) throw new Error("tuple element has no value");
          return v;
        });
        return { tag: "tuple", values };
      }
      case "index": {
        const target = visit(node.target);
        if (target === null) throw new Error("index target has no value");
        if (target.tag !== "tuple") throw new Error("cannot index non-tuple");
        return target.values[node.index]!;
      }
      case "array": {
        const values = node.elements.map(e => {
          const v = visit(e);
          if (v === null) throw new Error("array element has no value");
          return v;
        });
        return { tag: "array", values };
      }
      case "array_index": {
        const target = visit(node.target);
        if (target === null) throw new Error("array target has no value");
        if (target.tag !== "array") throw new Error("cannot index non-array");
        const idx = toNum(visit(node.index)!);
        return target.values[idx]!;
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
