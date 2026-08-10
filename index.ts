// --- Tokenizer ---

type Token =
  | { type: "number"; value: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" }
  | { type: "keyword"; value: "in" | "let" }
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
    } else if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) {
        ident += source[i]!;
        i++;
      }
      if (ident === "in" || ident === "let") {
        tokens.push({ type: "keyword", value: ident as "in" | "let" });
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
  | { type: "let"; name: string; init: Expr }
  | { type: "expr"; expr: Expr };

type Expr =
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | { type: "binary"; op: string; left: Expr; right: Expr }
  | { type: "group"; nodes: AstNode[] };

type BlockStmt =
  | { type: "let"; name: string; init: Expr }
  | { type: "expr"; expr: Expr };

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
      const tok = this.peek();
      if (tok.type === "keyword" && tok.value === "in") {
        nodes.push(this.parseDecl());
      } else if (tok.type === "keyword" && tok.value === "let") {
        nodes.push(this.parseLetDecl());
      } else {
        nodes.push(this.parseExprNode());
      }
    }
    return nodes;
  }

  parseLetDecl(): AstNode {
    this.consume(); // "let"
    const name = this.consumeIdentifier();
    const eqTok = this.peek();
    if (eqTok.type === "punct" && eqTok.value === "=") {
      this.consume(); // "="
      const init = this.parseExpr();
      const semiTok = this.peek();
      if (semiTok.type === "punct" && semiTok.value === ";") {
        this.consume(); // ";"
      }
      return { type: "let", name, init };
    }
    const semiTok = this.peek();
    if (semiTok.type === "punct" && semiTok.value === ";") {
      this.consume(); // ";"
    }
    return { type: "let", name, init: { type: "number", value: 0 } };
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
    if (token.type === "identifier") {
      return { type: "identifier", name: token.value };
    }
    throw new Error(`Unexpected token: ${token.type}`);
  }

  parseBlock(): AstNode[] {
    const nodes: AstNode[] = [];
    while (this.peek().type !== "eof" && this.peek().type !== "punct") {
      const tok = this.peek();
      if (tok.type === "keyword" && tok.value === "let") {
        nodes.push(this.parseLetDecl());
      } else {
        nodes.push(this.parseExprNode());
      }
    }
    // Consume closing "}"
    const closeTok = this.peek();
    if (closeTok.type === "punct" && closeTok.value === "}") {
      this.consume();
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
  if (node.type === "expr") {
    return wrapExpr(genExpr(node.expr));
  }
  throw new Error("Unknown node type");
}

function generateJS(nodes: AstNode[]): string {
  const lines = nodes.map((n) => genNode(n, (e) => `process.exit(${e});`));
  return lines.filter((l) => l).join("\n");
}

function generateBlockJS(nodes: AstNode[]): string {
  const lines = nodes.map((n) => genNode(n, (e) => `${e};`));
  return lines.join("");
}

function genExpr(expr: Expr): string {
  if (expr.type === "number") {
    return String(expr.value);
  }
  if (expr.type === "identifier") {
    return expr.name;
  }
  if (expr.type === "binary") {
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
      return `(function(){${lines}})()`;
    }
    // Simple grouping: just parenthesize the expression
    const last = expr.nodes[expr.nodes.length - 1]!;
    if (last.type === "expr") {
      return `(${genExpr(last.expr)})`;
    }
    return "(0)";
  }
  throw new Error("Unknown expression type");
}

// --- Compiler ---

export function compileTuffToJS(tuffSource: string): string {
  const tokens = tokenize(tuffSource);
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return generateJS(ast);
}
