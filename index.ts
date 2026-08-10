// --- Tokenizer ---

type Token =
  | { type: "number"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "==" | "<" }
  | { type: "keyword"; value: "in" | "let" | "mut" | "if" | "else" }
  | { type: "identifier"; value: string }
  | { type: "punct"; value: ";" | "(" | ")" | "{" | "}" | "=" }
  | { type: "eof" };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
    } else if (/\d/.test(ch)) {
      let num = "";
      while (i < source.length && /\d/.test(source[i]!)) {
        num += source[i]!;
        i++;
      }
      tokens.push({ type: "number", value: num });
    } else if (/[+\-*/]/.test(ch)) {
      tokens.push({ type: "op", value: ch as "+" | "-" | "*" | "/" });
      i++;
    } else if (ch === "=" && source[i + 1] === "=") {
      tokens.push({ type: "op", value: "==" });
      i += 2;
    } else if (ch === "<") {
      tokens.push({ type: "op", value: "<" });
      i++;
    } else if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) {
        ident += source[i]!;
        i++;
      }
      if (ident === "in" || ident === "let" || ident === "mut" || ident === "if" || ident === "else") {
        tokens.push({ type: "keyword", value: ident as "in" | "let" | "mut" | "if" | "else" });
      } else if (ident === "true") {
        tokens.push({ type: "boolean", value: true });
      } else if (ident === "false") {
        tokens.push({ type: "boolean", value: false });
      } else {
        tokens.push({ type: "identifier", value: ident });
      }
    } else if (ch === ";") {
      tokens.push({ type: "punct", value: ";" });
      i++;
    } else if (ch === "=") {
      tokens.push({ type: "punct", value: "=" });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "punct", value: "(" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "punct", value: ")" });
      i++;
    } else if (ch === "{") {
      tokens.push({ type: "punct", value: "{" });
      i++;
    } else if (ch === "}") {
      tokens.push({ type: "punct", value: "}" });
      i++;
    } else {
      throw new Error(`Unexpected character: ${ch}`);
    }
  }
  tokens.push({ type: "eof" });
  return tokens;
}

// --- AST ---

type AstNode =
  | { type: "decl"; name: string }
  | { type: "let"; name: string; mutable: boolean; init: Expr }
  | { type: "assign"; name: string; value: Expr }
  | { type: "expr"; expr: Expr };

type Expr =
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "identifier"; name: string }
  | { type: "binary"; op: string; left: Expr; right: Expr }
  | { type: "group"; nodes: AstNode[] }
  | { type: "assign"; name: string; value: Expr }
  | { type: "if"; condition: Expr; thenExpr: Expr; elseExpr: Expr };

type VarType = "number" | "boolean";

// --- Parser ---

class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  peek(): Token {
    return this.tokens[this.pos]!;
  }

  consume(): Token {
    return this.tokens[this.pos++]!;
  }

  parse(): AstNode[] {
    const nodes: AstNode[] = [];
    while (this.peek().type !== "eof") {
      nodes.push(this.parseStmt(true));
    }
    return nodes;
  }

  parseStmt(allowIn: boolean): AstNode {
    const tok = this.peek();
    if (allowIn && tok.type === "keyword" && tok.value === "in") {
      return this.parseDecl();
    }
    if (tok.type === "keyword" && tok.value === "let") {
      return this.parseLetDecl();
    }
    if (tok.type === "identifier") {
      const next = this.tokens[this.pos + 1];
      if (next && next.type === "punct" && next.value === "=") {
        return this.parseAssignStmt();
      }
    }
    // Fall through to parseExprNode for expressions and `{` grouping
    return this.parseExprNode();
  }

  parseLetDecl(): AstNode {
    this.consume(); // "let"
    const mutTok = this.peek();
    const mutable = mutTok.type === "keyword" && mutTok.value === "mut";
    if (mutable) {
      this.consume(); // "mut"
    }
    const name = this.consumeIdentifier();
    const eqTok = this.peek();
    if (eqTok.type === "punct" && eqTok.value === "=") {
      this.consume(); // "="
      const init = this.parseExpr();
      const semiTok = this.peek();
      if (semiTok.type === "punct" && semiTok.value === ";") {
        this.consume(); // ";"
      }
      return { type: "let", name, mutable, init };
    }
    const semiTok = this.peek();
    if (semiTok.type === "punct" && semiTok.value === ";") {
      this.consume(); // ";"
    }
    return { type: "let", name, mutable, init: { type: "number", value: 0 } };
  }

  parseAssignStmt(): AstNode {
    const name = this.consumeIdentifier();
    const eqTok = this.peek();
    if (eqTok.type === "punct" && eqTok.value === "=") {
      this.consume(); // "="
      const value = this.parseExpr();
      const semiTok = this.peek();
      if (semiTok.type === "punct" && semiTok.value === ";") {
        this.consume(); // ";"
      }
      return { type: "assign", name, value };
    }
    throw new Error(`Expected '=' after identifier`);
  }

  parseDecl(): AstNode {
    this.consume(); // "in"
    const tok = this.peek();
    if (tok.type !== "keyword" || tok.value !== "let") {
      throw new Error("Expected 'let' after 'in'");
    }
    this.consume(); // "let"
    const name = this.consumeIdentifier();
    if (this.peek().type === "punct") {
      this.consume(); // ";"
    }
    return { type: "decl", name };
  }

  parseExprNode(): AstNode {
    const expr = this.parseExpr();
    return { type: "expr", expr };
  }

  // Expression: number or binary (left-associative, no precedence for now)
  parseExpr(): Expr {
    let left = this.parsePrimary();
    while (this.peek().type === "op") {
      const op = this.consume();
      if (op.type !== "op") throw new Error("Expected operator");
      const right = this.parsePrimary();
      left = { type: "binary", op: op.value, left, right };
    }
    return left;
  }

  parsePrimary(): Expr {
    const token = this.consume();
    if (token.type === "number") {
      return { type: "number", value: parseInt(token.value, 10) };
    }
    if (token.type === "boolean") {
      return { type: "boolean", value: token.value };
    }
    if (token.type === "punct" && token.value === "(") {
      const expr = this.parseExpr();
      const closingTok = this.peek();
      if (closingTok.type !== "punct" || closingTok.value !== ")") {
        throw new Error("Expected ')'");
      }
      this.consume();
      return { type: "group", nodes: [{ type: "expr", expr }] };
    }
    if (token.type === "punct" && token.value === "{") {
      const nodes = this.parseBlock();
      return { type: "group", nodes };
    }
    if (token.type === "keyword" && token.value === "if") {
      // Parse: if (condition) thenExpr else elseExpr
      const openTok = this.peek();
      if (openTok.type !== "punct" || openTok.value !== "(") {
        throw new Error("Expected '(' after 'if'");
      }
      this.consume(); // "("
      const condition = this.parseExpr();
      const closeTok = this.peek();
      if (closeTok.type !== "punct" || closeTok.value !== ")") {
        throw new Error("Expected ')' after condition");
      }
      this.consume(); // ")"
      const thenExpr = this.parseExpr();
      const elseTok = this.peek();
      if (elseTok.type !== "keyword" || elseTok.value !== "else") {
        throw new Error("Expected 'else'");
      }
      this.consume(); // "else"
      const elseExpr = this.parseExpr();
      return { type: "if", condition, thenExpr, elseExpr };
    }
    if (token.type === "identifier") {
      return { type: "identifier", name: token.value };
    }
    throw new Error(`Unexpected token: ${token.type}`);
  }

  parseBlock(): AstNode[] {
    const nodes: AstNode[] = [];
    while (this.peek().type !== "eof") {
      const tok = this.peek();
      if (tok.type === "punct" && tok.value === "}") {
        this.consume(); // consume "}"
        break;
      }
      nodes.push(this.parseStmt(false));
    }
    return nodes;
  }

  consumeIdentifier(): string {
    const token = this.peek();
    if (token.type === "identifier") {
      this.consume();
      return token.value;
    }
    throw new Error("Expected identifier");
  }
}

// --- Code Generator ---

function genNode(node: AstNode, wrapExpr: (expr: string) => string): string {
  if (node.type === "decl") {
    return "";
  }
  if (node.type === "let") {
    return `let ${node.name}=${genExpr(node.init)};`;
  }
  if (node.type === "assign") {
    return `${node.name}=${genExpr(node.value)};`;
  }
  if (node.type === "expr") {
    return wrapExpr(genExpr(node.expr));
  }
  throw new Error("Unknown node type");
}

function generateJS(nodes: AstNode[]): string {
  const lines = nodes.map((n) => genNode(n, (e) => `process.exit(Number(${e}));`));
  return lines.filter((l) => l).join("\n");
}

function generateBlockJS(nodes: AstNode[]): string {
  const lines = nodes.map((n) => genNode(n, (e) => `${e};`));
  return lines.join("");
}

function genComparisonOp(left: string, op: string, right: string): string {
  const jsOp = op === "==" ? "===" : op;
  return `(${left} ${jsOp} ${right})`;
}

const comparisonOps = new Set(["==", "<"]);

function genExpr(expr: Expr): string {
  if (expr.type === "number") {
    return String(expr.value);
  }
  if (expr.type === "boolean") {
    return expr.value ? "true" : "false";
  }
  if (expr.type === "identifier") {
    return expr.name;
  }
  if (expr.type === "assign") {
    return `${expr.name}=${genExpr(expr.value)}`;
  }
  if (expr.type === "binary") {
    if (comparisonOps.has(expr.op)) {
      return genComparisonOp(genExpr(expr.left), expr.op, genExpr(expr.right));
    }
    return `${genExpr(expr.left)} ${expr.op} ${genExpr(expr.right)}`;
  }
  if (expr.type === "group") {
    // If the block contains let declarations, wrap in IIFE
    const hasLet = expr.nodes.some((n) => n.type === "let");
    if (hasLet) {
      const lines = generateBlockJS(expr.nodes);
      const last = expr.nodes[expr.nodes.length - 1]!;
      if (last.type === "expr") {
        return `(function(){${lines}return ${genExpr(last.expr)};})()`;
      }
      throw new Error("Block with declarations must end with an expression");
    }
    // Simple grouping: generate all nodes as comma expression
    const parts = expr.nodes.map(n => genNode(n, (e) => e).replace(/;$/, ""));
    if (parts.length === 0) return "(0)";
    return `(${parts.join(",")})`;
  }
  if (expr.type === "if") {
    return `(${genExpr(expr.condition)}) ? ${genExpr(expr.thenExpr)} : ${genExpr(expr.elseExpr)}`;
  }
  throw new Error("Unknown expression type");
}

// --- Scope Validation ---

function validateScopes(nodes: AstNode[]): void {
  const scope: string[] = [];
  const mutableVars = new Set<string>();
  const types = new Map<string, VarType>();
  for (const node of nodes) {
    if (node.type === "decl") {
      scope.push(node.name);
    } else {
      validateNodeScope(node, scope, mutableVars, types);
    }
  }
}

function validateNodeScope(node: AstNode, scope: string[], mutableVars: Set<string>, types: Map<string, VarType>): void {
  if (node.type === "decl") return;
  if (node.type === "let") {
    const initType = inferExprType(node.init, scope, mutableVars, types);
    scope.push(node.name);
    types.set(node.name, initType);
    if (node.mutable) {
      mutableVars.add(node.name);
    }
    return;
  }
  if (node.type === "assign") {
    validateAssign(node.name, node.value, scope, mutableVars, types);
    return;
  }
  if (node.type === "expr") {
    inferExprType(node.expr, scope, mutableVars, types, false);
    return;
  }
}

function validateAssignType(varName: string, value: Expr, types: Map<string, VarType>, scope: string[], mutableVars: Set<string>): void {
  const varType = types.get(varName)!;
  const valType = inferExprType(value, scope, mutableVars, types);
  if (varType !== valType) {
    throw new Error(`Type mismatch: cannot assign ${valType} to ${varType}`);
  }
}

function validateAssign(name: string, value: Expr, scope: string[], mutableVars: Set<string>, types: Map<string, VarType>): void {
  if (!scope.includes(name)) {
    throw new Error(`Undefined variable: ${name}`);
  }
  if (!mutableVars.has(name)) {
    throw new Error(`Cannot assign to immutable variable: ${name}`);
  }
  validateAssignType(name, value, types, scope, mutableVars);
}

function inferExprType(expr: Expr, scope: string[], mutableVars: Set<string>, types: Map<string, VarType>, asValue = true): VarType {
  if (expr.type === "number") {
    return "number";
  }
  if (expr.type === "boolean") {
    return "boolean";
  }
  if (expr.type === "identifier") {
    if (!scope.includes(expr.name)) {
      throw new Error(`Undefined variable: ${expr.name}`);
    }
    return types.get(expr.name) || "number";
  }
  if (expr.type === "binary") {
    if (comparisonOps.has(expr.op)) return "boolean";
    return "number";
  }
  if (expr.type === "assign") {
    validateAssignType(expr.name, expr.value, types, scope, mutableVars);
    return types.get(expr.name)!;
  }
  if (expr.type === "group") {
    const scope_ = [...scope];
    const mut_ = new Set(mutableVars);
    const types_ = new Map(types);
    for (const node of expr.nodes) {
      validateNodeScope(node, scope_, mut_, types_);
    }
    const last = expr.nodes[expr.nodes.length - 1];
    if (last && last.type === "expr") {
      return inferExprType(last.expr, scope_, mut_, types_, asValue);
    }
    if (asValue && expr.nodes.length > 0) {
      throw new Error("Block used as expression must end with an expression");
    }
    return "number";
  }
  if (expr.type === "if") {
    const thenType = inferExprType(expr.thenExpr, scope, mutableVars, types, false);
    const elseType = inferExprType(expr.elseExpr, scope, mutableVars, types, false);
    if (thenType !== elseType) {
      throw new Error(`If branches must have the same type: ${thenType} vs ${elseType}`);
    }
    return thenType;
  }
  return "number";
}

// --- Compiler ---

export function compileTuffToJS(tuffSource: string): string {
  const tokens = tokenize(tuffSource);
  const parser = new Parser(tokens);
  const ast = parser.parse();
  validateScopes(ast);
  return generateJS(ast);
}
