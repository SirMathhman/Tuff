// --- Tokenizer ---

type Token =
  | { type: "number"; value: string; u8: boolean }
  | { type: "boolean"; value: boolean }
  | {
      type: "op";
      value: "+" | "-" | "*" | "/" | "==" | "<" | "+=" | ".." | "=>" | ">>";
    }
  | {
      type: "keyword";
      value:
        | "in"
        | "let"
        | "mut"
        | "if"
        | "else"
        | "while"
        | "for"
        | "break"
        | "continue"
        | "match"
        | "case";
    }
  | { type: "identifier"; value: string }
  | { type: "punct"; value: ";" | "(" | ")" | "{" | "}" | "=" | ">" | "[" | "]" | "," }
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
      // Check for U8 suffix
      const u8 = source.slice(i, i + 2) === "U8";
      if (u8) {
        i += 2;
      }
      tokens.push({ type: "number", value: num, u8 });
    } else if (ch === "." && source[i + 1] === ".") {
      tokens.push({ type: "op", value: ".." });
      i += 2;
    } else if (ch === ">" && source[i + 1] === ">") {
      tokens.push({ type: "op", value: ">>" });
      i += 2;
    } else if (ch === ">") {
      tokens.push({ type: "punct", value: ">" });
      i++;
    } else if (ch === "+" && source[i + 1] === "=") {
      tokens.push({ type: "op", value: "+=" });
      i += 2;
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
      if (
        ident === "in" ||
        ident === "let" ||
        ident === "mut" ||
        ident === "if" ||
        ident === "else" ||
        ident === "while" ||
        ident === "for" ||
        ident === "break" ||
        ident === "continue" ||
        ident === "match" ||
        ident === "case"
      ) {
        tokens.push({
          type: "keyword",
          value: ident as
            | "in"
            | "let"
            | "mut"
            | "if"
            | "else"
            | "while"
            | "for"
            | "break"
            | "continue"
            | "match"
            | "case",
        });
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
    } else if (ch === "=" && source[i + 1] === ">") {
      tokens.push({ type: "op", value: "=>" });
      i += 2;
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
    } else if (ch === "[") {
      tokens.push({ type: "punct", value: "[" });
      i++;
    } else if (ch === "]") {
      tokens.push({ type: "punct", value: "]" });
      i++;
    } else if (ch === "}") {
      tokens.push({ type: "punct", value: "}" });
      i++;
    } else if (ch === ",") {
      tokens.push({ type: "punct", value: "," });
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
  | { type: "assign"; target: Expr; value: Expr }
  | { type: "expr"; expr: Expr }
  | { type: "while"; condition: Expr; body: AstNode[] }
  | { type: "for"; varName: string; rangeExpr: Expr; body: AstNode[] }
  | { type: "break" }
  | { type: "continue" };

type Expr =
  | { type: "number"; value: number; u8: boolean }
  | { type: "boolean"; value: boolean }
  | { type: "identifier"; name: string }
  | { type: "binary"; op: string; left: Expr; right: Expr }
  | { type: "unary"; op: "-"; operand: Expr }
  | { type: "range"; start: Expr; end: Expr }
  | { type: "group"; nodes: AstNode[] }
  | { type: "assign"; target: Expr; value: Expr }
  | { type: "if"; condition: Expr; thenNode: AstNode; elseNode: AstNode | null }
  | { type: "match"; target: Expr; cases: { pattern: Expr; body: Expr }[] }
  | { type: "array"; elements: Expr[] }
  | { type: "index"; target: Expr; index: Expr };

type VarType = "number" | "boolean" | "range" | "array";

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
    if (tok.type === "keyword" && tok.value === "while") {
      return this.parseWhile();
    }
    if (tok.type === "keyword" && tok.value === "for") {
      return this.parseFor();
    }
    if (tok.type === "keyword" && tok.value === "break") {
      this.consume(); // "break"
      const semi = this.peek();
      if (semi.type === "punct" && semi.value === ";") {
        this.consume(); // ";"
      }
      return { type: "break" };
    }
    if (tok.type === "keyword" && tok.value === "continue") {
      this.consume(); // "continue"
      const semi = this.peek();
      if (semi.type === "punct" && semi.value === ";") {
        this.consume(); // ";"
      }
      return { type: "continue" };
    }
    if (tok.type === "identifier") {
      const next = this.tokens[this.pos + 1];
      if (
        next &&
        ((next.type === "punct" && next.value === "=") ||
          (next.type === "op" && next.value === "+="))
      ) {
        return this.parseAssignStmt();
      }
      // Check for array index assignment: array[0] = 1
      if (next && next.type === "punct" && next.value === "[") {
        // Look ahead to find if there's an = after the ]
        let idx = this.pos + 2;
        while (idx < this.tokens.length && this.tokens[idx]!.type !== "eof") {
          const tok = this.tokens[idx]!;
          if (tok.type === "punct" && tok.value === "]") {
            const afterBracket = this.tokens[idx + 1];
            if (afterBracket && ((afterBracket.type === "punct" && afterBracket.value === "=") || (afterBracket.type === "op" && afterBracket.value === "+="))) {
              return this.parseAssignStmt();
            }
            break;
          }
          idx++;
        }
      }
    }
    // Fall through to parseExprNode for expressions and `{` grouping
    const node = this.parseExprNode();
    const semi = this.peek();
    if (semi.type === "punct" && semi.value === ";") {
      this.consume(); // ";"
    }
    return node;
  }

  parseWhile(): AstNode {
    this.consume(); // "while"
    const openTok = this.peek();
    if (openTok.type !== "punct" || openTok.value !== "(") {
      throw new Error("Expected '(' after 'while'");
    }
    this.consume(); // "("
    const condition = this.parseExpr();
    const closeTok = this.peek();
    if (closeTok.type !== "punct" || closeTok.value !== ")") {
      throw new Error("Expected ')' after while condition");
    }
    this.consume(); // ")"
    const body = this.parseLoopBody();
    return { type: "while", condition, body };
  }

  parseLoopBody(): AstNode[] {
    const body: AstNode[] = [];
    const tok = this.peek();
    if (tok.type === "punct" && tok.value === "{") {
      this.consume(); // "{"
      while (this.peek().type !== "eof") {
        const t = this.peek();
        if (t.type === "punct" && t.value === "}") {
          this.consume(); // "}"
          break;
        }
        body.push(this.parseStmt(false));
      }
    } else {
      body.push(this.parseStmt(false));
    }
    return body;
  }

  parseFor(): AstNode {
    this.consume(); // "for"
    const openTok = this.peek();
    if (openTok.type !== "punct" || openTok.value !== "(") {
      throw new Error("Expected '(' after 'for'");
    }
    this.consume(); // "("
    const varName = this.consumeIdentifier();
    const inTok = this.peek();
    if (inTok.type !== "keyword" || inTok.value !== "in") {
      throw new Error("Expected 'in' after loop variable");
    }
    this.consume(); // "in"
    const parsedRange = this.parseExpr();
    let rangeExpr: Expr;
    if (parsedRange.type === "binary" && parsedRange.op === "..") {
      rangeExpr = {
        type: "range",
        start: parsedRange.left,
        end: parsedRange.right,
      };
    } else if (parsedRange.type === "identifier") {
      rangeExpr = parsedRange;
    } else {
      throw new Error("Expected range expression or range variable");
    }
    const closeTok = this.peek();
    if (closeTok.type !== "punct" || closeTok.value !== ")") {
      throw new Error("Expected ')' after for range");
    }
    this.consume(); // ")"
    const body = this.parseLoopBody();
    return { type: "for", varName, rangeExpr, body };
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
    return { type: "let", name, mutable, init: { type: "number", value: 0, u8: false } };
  }

  parseAssignStmt(): AstNode {
    const name = this.consumeIdentifier();
    const target = this.parseIndexChain({ type: "identifier", name });
    const opTok = this.peek();
    let value: Expr;
    if (opTok.type === "op" && opTok.value === "+=") {
      this.consume(); // "+="
      value = {
        type: "binary",
        op: "+",
        left: target,
        right: this.parseExpr(),
      };
    } else if (opTok.type === "punct" && opTok.value === "=") {
      this.consume(); // "="
      value = this.parseExpr();
    } else {
      throw new Error(`Expected '=' after identifier`);
    }
    const semiTok = this.peek();
    if (semiTok.type === "punct" && semiTok.value === ";") {
      this.consume(); // ";"
    }
    return { type: "assign", target, value };
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
    while (true) {
      const next = this.peek();
      if (next.type !== "op" || next.value === "=>" || next.value === ">>")
        break;
      this.consume();
      const right = this.parsePrimary();
      left = { type: "binary", op: next.value, left, right };
    }
    return left;
  }

  parsePrimary(): Expr {
    const token = this.peek();
    // Handle unary minus
    if (token.type === "op" && token.value === "-") {
      this.consume();
      const operand = this.parsePrimary();
      return { type: "unary", op: "-", operand };
    }
    this.consume();
    if (token.type === "number") {
      return { type: "number", value: parseInt(token.value, 10), u8: token.u8 };
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
      const thenNode = this.parseStmt(false);
      const elseTok = this.peek();
      if (elseTok.type === "keyword" && elseTok.value === "else") {
        this.consume(); // "else"
        const elseNode = this.parseStmt(false);
        return { type: "if", condition, thenNode, elseNode };
      }
      return { type: "if", condition, thenNode, elseNode: null };
    }
    if (token.type === "keyword" && token.value === "match") {
      // Parse: match (target) { case pattern => body; ... }
      const openTok = this.peek();
      if (openTok.type !== "punct" || openTok.value !== "(") {
        throw new Error("Expected '(' after 'match'");
      }
      this.consume(); // "("
      const target = this.parseExpr();
      const closeTok = this.peek();
      if (closeTok.type !== "punct" || closeTok.value !== ")") {
        throw new Error("Expected ')' after match target");
      }
      this.consume(); // ")"
      const braceTok = this.peek();
      if (braceTok.type !== "punct" || braceTok.value !== "{") {
        throw new Error("Expected '{' after match target");
      }
      this.consume(); // "{"
      const cases: { pattern: Expr; body: Expr }[] = [];
      while (true) {
        const tok = this.peek();
        if (tok.type === "eof" || (tok.type === "punct" && tok.value === "}")) {
          if (tok.type === "punct") this.consume(); // "}"
          break;
        }
        if (tok.type === "keyword" && tok.value === "case") {
          this.consume(); // "case"
          const pattern = this.parseExpr();
          const arrowTok = this.peek();
          if (arrowTok.type !== "op" || arrowTok.value !== "=>") {
            throw new Error("Expected '=>' after case pattern");
          }
          this.consume(); // "=>"
          const body = this.parseExpr();
          cases.push({ pattern, body });
          // Optional semicolon
          const semi = this.peek();
          if (semi.type === "punct" && semi.value === ";") {
            this.consume();
          }
        } else {
          throw new Error(`Expected 'case' in match block`);
        }
      }
      return { type: "match", target, cases };
    }
    if (token.type === "punct" && token.value === "[") {
      // Array literal: [1, 2, 3]
      const elements: Expr[] = [];
      while (true) {
        const tok = this.peek();
        if (tok.type === "eof" || (tok.type === "punct" && tok.value === "]")) {
          if (tok.type === "punct") this.consume(); // "]"
          break;
        }
        elements.push(this.parseExpr());
        const comma = this.peek();
        if (comma.type === "punct" && comma.value === ",") {
          this.consume();
        }
      }
      return { type: "array", elements };
    }
    if (token.type === "identifier") {
      return this.parseIndexChain({ type: "identifier", name: token.value });
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

  parseIndexChain(base: Expr): Expr {
    let result = base;
    while (true) {
      const next = this.peek();
      if (next.type !== "punct" || next.value !== "[") break;
      this.consume(); // "["
      const index = this.parseExpr();
      const closeTok = this.peek();
      if (closeTok.type !== "punct" || closeTok.value !== "]") {
        throw new Error("Expected ']'");
      }
      this.consume(); // "]"
      result = { type: "index", target: result, index };
    }
    return result;
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
    return `${genExpr(node.target)}=${genExpr(node.value)};`;
  }
  if (node.type === "expr") {
    return wrapExpr(genExpr(node.expr));
  }
  if (node.type === "while") {
    const bodyJs = node.body.map((n) => genNode(n, (e) => `${e};`)).join("");
    return `while (${genExpr(node.condition)}) {${bodyJs}}`;
  }
  if (node.type === "for") {
    const bodyJs = node.body.map((n) => genNode(n, (e) => `${e};`)).join("");
    const startJs = genRangeStart(node.rangeExpr);
    const endJs = genRangeEnd(node.rangeExpr);
    return `for (let ${node.varName}=${startJs}; ${node.varName}<${endJs}; ${node.varName}++) {${bodyJs}}`;
  }
  if (node.type === "break") {
    return "break;";
  }
  if (node.type === "continue") {
    return "continue;";
  }
  throw new Error("Unknown node type");
}

function generateJS(nodes: AstNode[]): string {
  const lines = nodes.map((n) =>
    genNode(n, (e) => `process.exit(Number(${e}));`),
  );
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
    return `${genExpr(expr.target)}=${genExpr(expr.value)}`;
  }
  if (expr.type === "binary") {
    if (comparisonOps.has(expr.op)) {
      return genComparisonOp(genExpr(expr.left), expr.op, genExpr(expr.right));
    }
    if (expr.op === "..") {
      return `{start:${genExpr(expr.left)},end:${genExpr(expr.right)}}`;
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
    const parts = expr.nodes.map((n) => genNode(n, (e) => e).replace(/;$/, ""));
    if (parts.length === 0) return "(0)";
    return `(${parts.join(",")})`;
  }
  if (expr.type === "if") {
    const thenJs = genNode(expr.thenNode, (e) => e).replace(/;$/, "");
    const elseJs = expr.elseNode
      ? genNode(expr.elseNode, (e) => e).replace(/;$/, "")
      : "0";
    return `(${genExpr(expr.condition)}) ? ${thenJs} : ${elseJs}`;
  }
  if (expr.type === "match") {
    const targetJs = genExpr(expr.target);
    const casesJs = expr.cases
      .map((c) => {
        if (c.pattern.type === "identifier" && c.pattern.name === "_") {
          return `default:{return ${genExpr(c.body)};}`;
        }
        return `case ${genExpr(c.pattern)}:{return ${genExpr(c.body)};}`;
      })
      .join("");
    return `(function(t){switch(t){${casesJs}}})(${targetJs})`;
  }
  if (expr.type === "array") {
    const elementsJs = expr.elements.map(e => genExpr(e)).join(",");
    return `[${elementsJs}]`;
  }
  if (expr.type === "index") {
    return `${genExpr(expr.target)}[${genExpr(expr.index)}]`;
  }
  if (expr.type === "unary") {
    return `(-${genExpr(expr.operand)})`;
  }
  throw new Error("Unknown expression type");
}

// --- Scope Validation ---

function validateScopes(nodes: AstNode[]): void {
  for (const node of nodes) {
    validateU8(node);
  }
  const scope: string[] = [];
  const mutableVars = new Set<string>();
  const types = new Map<string, VarType>();
  const u8Vars = new Set<string>();
  for (const node of nodes) {
    if (node.type === "decl") {
      scope.push(node.name);
    } else {
      validateNodeScope(node, scope, mutableVars, types, u8Vars);
    }
  }
}

function validateU8(node: AstNode): void {
  if (node.type === "let" || node.type === "assign" || node.type === "expr") {
    validateU8Expr(
      node.type === "let" ? node.init : node.type === "assign" ? node.value : node.expr,
    );
  }
  if (node.type === "while") {
    validateU8Expr(node.condition);
    for (const n of node.body) validateU8(n);
  }
  if (node.type === "for") {
    validateU8Range(node.rangeExpr);
    for (const n of node.body) validateU8(n);
  }
}

function validateU8Expr(expr: Expr): void {
  if (expr.type === "number" && expr.u8 && expr.value > 255) {
    throw new Error(`U8 literal out of range: ${expr.value}`);
  }
  if (expr.type === "binary") {
    validateU8Expr(expr.left);
    validateU8Expr(expr.right);
  }
  if (expr.type === "group") {
    for (const n of expr.nodes) validateU8(n);
  }
  if (expr.type === "if") {
    validateU8Expr(expr.condition);
    validateU8(expr.thenNode);
    if (expr.elseNode) validateU8(expr.elseNode);
  }
  if (expr.type === "match") {
    validateU8Expr(expr.target);
    for (const c of expr.cases) {
      validateU8Expr(c.pattern);
      validateU8Expr(c.body);
    }
  }
  if (expr.type === "array") {
    for (const e of expr.elements) validateU8Expr(e);
  }
  if (expr.type === "index") {
    validateU8Expr(expr.target);
    validateU8Expr(expr.index);
  }
  if (expr.type === "unary") {
    validateU8Expr(expr.operand);
  }
}

function validateU8Range(expr: Expr): void {
  if (expr.type === "range") {
    validateU8Expr(expr.start);
    validateU8Expr(expr.end);
  }
}

function validateNodeScope(
  node: AstNode,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
  u8Vars: Set<string>,
): void {
  if (node.type === "decl") return;
  if (node.type === "let") {
    const initType = inferExprType(node.init, scope, mutableVars, types);
    if (isU8Expr(node.init)) {
      u8Vars.add(node.name);
    }
    scope.push(node.name);
    types.set(node.name, initType);
    if (node.mutable) {
      mutableVars.add(node.name);
    }
    return;
  }
  if (node.type === "assign") {
    validateAssignExpr(node.target, node.value, scope, mutableVars, types);
    return;
  }
  if (node.type === "expr") {
    validateExprScope(node.expr, scope, mutableVars, types, u8Vars);
    return;
  }
  if (node.type === "while") {
    inferExprType(node.condition, scope, mutableVars, types);
    const scope_ = [...scope];
    const mut_ = new Set(mutableVars);
    const types_ = new Map(types);
    const u8_ = new Set(u8Vars);
    for (const n of node.body) {
      validateNodeScope(n, scope_, mut_, types_, u8_);
    }
    return;
  }
  if (node.type === "for") {
    validateRangeExpr(node.rangeExpr, scope, mutableVars, types);
    const scope_ = [...scope, node.varName];
    const mut_ = new Set(mutableVars);
    mut_.add(node.varName);
    const types_ = new Map(types);
    types_.set(node.varName, "number");
    const u8_ = new Set(u8Vars);
    for (const n of node.body) {
      validateNodeScope(n, scope_, mut_, types_, u8_);
    }
    return;
  }
  if (node.type === "break") {
    return;
  }
  if (node.type === "continue") {
    return;
  }
}

function isU8Expr(expr: Expr): boolean {
  if (expr.type === "number" && expr.u8) return true;
  return false;
}

function assertDefined(name: string, scope: string[]): void {
  if (!scope.includes(name)) {
    throw new Error(`Undefined variable: ${name}`);
  }
}

function validateRangeExpr(
  expr: Expr,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
): void {
  if (expr.type === "range") {
    inferExprType(expr.start, scope, mutableVars, types);
    inferExprType(expr.end, scope, mutableVars, types);
  } else if (expr.type === "identifier") {
    assertDefined(expr.name, scope);
    const varType = types.get(expr.name);
    if (varType !== "range") {
      throw new Error(`Expected range type, got ${varType}`);
    }
  } else {
    throw new Error("Expected range expression or range variable");
  }
}

function genRangeStart(expr: Expr): string {
  if (expr.type === "range") {
    return genExpr(expr.start);
  }
  if (expr.type === "identifier") {
    return `${expr.name}.start`;
  }
  throw new Error("Invalid range expression");
}

function genRangeEnd(expr: Expr): string {
  if (expr.type === "range") {
    return genExpr(expr.end);
  }
  if (expr.type === "identifier") {
    return `${expr.name}.end`;
  }
  throw new Error("Invalid range expression");
}

function checkTypeMismatch(
  varName: string,
  value: Expr,
  types: Map<string, VarType>,
  scope: string[],
  mutableVars: Set<string>,
): void {
  const varType = types.get(varName)!;
  const valType = inferExprType(value, scope, mutableVars, types);
  if (varType !== valType) {
    throw new Error(`Type mismatch: cannot assign ${valType} to ${varType}`);
  }
}

function validateAssignExpr(
  target: Expr,
  value: Expr,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
): void {
  inferExprType(target, scope, mutableVars, types);
  if (target.type === "identifier") {
    if (!mutableVars.has(target.name)) {
      throw new Error(`Cannot assign to immutable variable: ${target.name}`);
    }
    checkTypeMismatch(target.name, value, types, scope, mutableVars);
  } else {
    inferExprType(value, scope, mutableVars, types);
  }
}

function isGroupExpr(expr: Expr): expr is { type: "group"; nodes: AstNode[] } {
  return expr.type === "group";
}

function validateGroupScope(
  expr: { type: "group"; nodes: AstNode[] },
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
  u8Vars: Set<string>,
): [string[], Set<string>, Map<string, VarType>] {
  const scope_ = [...scope];
  const mut_ = new Set(mutableVars);
  const types_ = new Map(types);
  const u8_ = new Set(u8Vars);
  for (const node of expr.nodes) {
    validateNodeScope(node, scope_, mut_, types_, u8_);
  }
  return [scope_, mut_, types_];
}

function validateExprScope(
  expr: Expr,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
  u8Vars: Set<string>,
): void {
  if (isGroupExpr(expr)) {
    validateGroupScope(expr, scope, mutableVars, types, u8Vars);
    return;
  }
  if (expr.type === "if") {
    validateNodeScope(expr.thenNode, scope, mutableVars, types, u8Vars);
    if (expr.elseNode) {
      validateNodeScope(expr.elseNode, scope, mutableVars, types, u8Vars);
    }
    return;
  }
  if (expr.type === "unary" && expr.op === "-") {
    if (expr.operand.type === "identifier" && u8Vars.has(expr.operand.name)) {
      throw new Error(`Cannot negate U8 variable: ${expr.operand.name}`);
    }
  }
  inferExprType(expr, scope, mutableVars, types);
}

function inferNodeType(
  node: AstNode,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
): VarType {
  if (node.type === "expr") {
    return inferExprType(node.expr, scope, mutableVars, types);
  }
  if (node.type === "let") {
    return types.get(node.name)!;
  }
  if (node.type === "assign") {
    if (node.target.type === "identifier") {
      return types.get(node.target.name)!;
    }
    return inferExprType(node.target, scope, mutableVars, types);
  }
  throw new Error("Node type cannot be inferred");
}

function inferExprType(
  expr: Expr,
  scope: string[],
  mutableVars: Set<string>,
  types: Map<string, VarType>,
): VarType {
  if (expr.type === "number") {
    return "number";
  }
  if (expr.type === "boolean") {
    return "boolean";
  }
  if (expr.type === "identifier") {
    assertDefined(expr.name, scope);
    return types.get(expr.name) || "number";
  }
  if (expr.type === "binary") {
    if (expr.op === "..") return "range";
    if (comparisonOps.has(expr.op)) return "boolean";
    return "number";
  }
  if (expr.type === "assign") {
    const target = expr.target;
    if (target.type === "identifier") {
      checkTypeMismatch(target.name, expr.value, types, scope, mutableVars);
      return types.get(target.name)!;
    }
    inferExprType(target, scope, mutableVars, types);
    return inferExprType(expr.value, scope, mutableVars, types);
  }
  if (isGroupExpr(expr)) {
    const [scope_, mut_, types_] = validateGroupScope(
      expr,
      scope,
      mutableVars,
      types,
      new Set(),
    );
    const last = expr.nodes[expr.nodes.length - 1];
    if (last && last.type === "expr") {
      return inferExprType(last.expr, scope_, mut_, types_);
    }
    throw new Error("Block used as expression must end with an expression");
  }
  if (expr.type === "if") {
    if (!expr.elseNode) {
      throw new Error("If used as expression must have an else branch");
    }
    const thenType = inferNodeType(expr.thenNode, scope, mutableVars, types);
    const elseType = inferNodeType(expr.elseNode, scope, mutableVars, types);
    if (thenType !== elseType) {
      throw new Error(
        `If branches must have the same type: ${thenType} vs ${elseType}`,
      );
    }
    return thenType;
  }
  if (expr.type === "unary") {
    return "number";
  }
  if (expr.type === "array") {
    for (const elem of expr.elements) {
      inferExprType(elem, scope, mutableVars, types);
    }
    return "array";
  }
  if (expr.type === "index") {
    assertDefined(expr.target.type === "identifier" ? expr.target.name : "", scope);
    inferExprType(expr.target, scope, mutableVars, types);
    inferExprType(expr.index, scope, mutableVars, types);
    return "number";
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
