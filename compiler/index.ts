// TUFF → TypeScript compiler

type TokenType =
  | "IDENT"
  | "NUMBER"
  | "LT"
  | "GT"
  | "LPAREN"
  | "RPAREN"
  | "PLUS"
  | "COLON"
  | "ASSIGN"
  | "SEMICOLON";

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "<") {
      tokens.push({ type: "LT", value: "<" });
      i++;
    } else if (ch === ">") {
      tokens.push({ type: "GT", value: ">" });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")" });
      i++;
    } else if (ch === "+") {
      tokens.push({ type: "PLUS", value: "+" });
      i++;
    } else if (ch === ":") {
      tokens.push({ type: "COLON", value: ":" });
      i++;
    } else if (ch === "=") {
      tokens.push({ type: "ASSIGN", value: "=" });
      i++;
    } else if (ch === ";") {
      tokens.push({ type: "SEMICOLON", value: ";" });
      i++;
    } else if (/[a-zA-Z_]\w*/.test(ch)) {
      let ident = "";
      while (i < source.length && /\w/.test(source[i]!)) {
        ident += source[i]!;
        i++;
      }
      tokens.push({ type: "IDENT", value: ident });
    } else if (/[0-9]/.test(ch)) {
      let num = "";
      while (i < source.length && /[0-9]/.test(source[i]!)) {
        num += source[i]!;
        i++;
      }
      tokens.push({ type: "NUMBER", value: num });
    } else {
      throw new Error(`Unexpected character '${ch}' at position ${i}`);
    }
  }
  return tokens;
}

// --- AST nodes ---

type Expr = ReadExpr | NumberLit | BinOp | IdentRef;

interface ReadExpr {
  kind: "read";
  typeArg: string; // e.g. "U8", "I32"
}

interface NumberLit {
  kind: "number";
  value: number;
}

interface BinOp {
  kind: "binop";
  op: "+";
  left: Expr;
  right: Expr;
}

interface IdentRef {
  kind: "ident";
  name: string;
}

type Statement = LetDecl | ExprStmt;

interface LetDecl {
  kind: "let";
  name: string;
  typeAnnotation: string; // e.g. "U8"
  init: Expr;
}

interface ExprStmt {
  kind: "expr";
  expr: Expr;
}

// --- Recursive descent parser ---

class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  parseProgram(): Statement[] | null {
    if (this.tokens.length === 0) return [];
    const stmts: Statement[] = [];
    while (!this.atEnd()) {
      stmts.push(this.parseStatement());
    }
    return stmts;
  }

  private atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private parseStatement(): Statement {
    const tok = this.peek();

    // let x : Type = expr ;
    if (tok.type === "IDENT" && tok.value === "let") {
      return this.parseLetDecl();
    }

    const expr = this.parseExpression();
    // If followed by ';', consume it — otherwise leave it for next iteration (end of program)
    if (!this.atEnd() && this.peek().type === "SEMICOLON") {
      this.advance();
    }
    return { kind: "expr", expr };
  }

  private parseLetDecl(): LetDecl {
    // consume 'let'
    this.advance();

    // variable name (IDENT)
    const nameTok = this.expect("IDENT");
    if (nameTok.type !== "IDENT")
      throw new Error(
        `Expected identifier after 'let', got '${nameTok.value}'`,
      );
    const name = nameTok.value;

    // ':' type annotation
    this.expect("COLON", `':' after variable name '${name}'`);

    // type argument (e.g. U8) — read until '=' or ';'
    let typeAnnotation = "";
    while (!this.atEnd() && !["ASSIGN"].includes(this.peek().type)) {
      const t = this.advance();
      if (t.type === "GT") break;
      typeAnnotation += t.value;
    }

    // '=' initializer expression
    this.expect("ASSIGN", `'=' after type annotation`);
    const init = this.parseExpression();

    // ';' terminator
    this.expect("SEMICOLON", `';' at end of let declaration for '${name}'`);

    return { kind: "let", name, typeAnnotation, init };
  }

  private parseExpression(): Expr {
    let left = this.parsePrimary();

    while (!this.atEnd() && this.peek().type === "PLUS") {
      this.advance(); // consume '+'
      const right = this.parsePrimary();
      left = { kind: "binop", op: "+", left, right };
    }

    return left;
  }

  private parsePrimary(): Expr {
    const tok = this.peek();

    // Parenthesized expression
    if (tok.type === "LPAREN") {
      this.advance(); // consume '('
      const expr = this.parseExpression();
      this.expect("RPAREN", "')'");
      return expr;
    }

    // read<T>()
    if (tok.type === "IDENT" && tok.value === "read") {
      this.advance(); // consume 'read'
      const typeArg = this.parseTypeArgument();
      this.expect("LPAREN", `'(' after read<T>`);
      this.expect("RPAREN", "')' in read expression");
      return { kind: "read", typeArg };
    }

    // number literal
    if (tok.type === "NUMBER") {
      this.advance();
      return { kind: "number", value: parseInt(tok.value, 10) };
    }

    // identifier reference — but NOT keywords like 'let' or 'read' followed by '<'
    if (tok.type === "IDENT" && tok.value !== "let") {
      this.advance();
      return { kind: "ident", name: tok.value };
    }

    throw new Error(`Unexpected token '${tok.value}'`);
  }

  private parseTypeArgument(): string {
    this.expect("LT", `'<', after 'read'`);
    let typeArg = "";
    while (!this.atEnd() && this.peek().type !== "GT") {
      const t = this.advance();
      typeArg += t.value;
    }
    this.expect("GT", `">' in read expression"`);
    return typeArg;
  }

  private peek(): Token {
    if (this.atEnd()) throw new Error("Unexpected end of input");
    return this.tokens[this.pos]!;
  }

  private advance(): Token {
    const tok = this.peek();
    this.pos++;
    return tok;
  }

  // Single consolidated expect method — replaces both old expectToken and expect
  private expect(type: TokenType, message?: string): Token {
    const tok = this.advance();
    if (tok.type !== type) {
      throw new Error(
        `Expected '${type}' but got '${tok.value}'. ${message ?? ""}`.trim(),
      );
    }
    return tok;
  }
}

// --- Code generation with stdin token index tracking and variable scoping ---

class Generator {
  private readIndex = 0; // tracks which stdin token each read<T>() consumes
  private declaredVars: Set<string> = new Set();

  generate(statements: Statement[] | null): string {
    if (!statements || statements.length === 0) return "return 0";

    const lines: string[] = [];
    lines.push("const tokens = stdIn.trim().split(/\\s+/);");

    // First pass: collect declared variable names for name resolution
    this.collectDeclarations(statements);

    // Second pass: generate code with name checking
    const lastStmt = statements[statements.length - 1]!;
    const priorStmts = statements.slice(0, statements.length - 1);

    for (const stmt of priorStmts) {
      this.generateStatement(stmt, lines);
    }

    // The final statement's expression is returned as the exit code
    if (lastStmt.kind === "expr") {
      const exprCode = this.generateExpr(lastStmt.expr);
      lines.push(`return ${exprCode};`);
    } else {
      // last stmt was a let decl with trailing ; — nothing to return, default 0
      lines.push("return 0;");
    }

    return lines.join("\n");
  }

  private collectDeclarations(statements: Statement[]): void {
    for (const stmt of statements) {
      if (stmt.kind === "let") {
        this.declaredVars.add(stmt.name);
      }
    }
  }

  private generateStatement(stmt: Statement, lines: string[]): void {
    switch (stmt.kind) {
      case "let": {
        const initCode = this.generateExpr(stmt.init);
        lines.push(`const ${stmt.name} = ${initCode};`);
        break;
      }
      case "expr": {
        // expression statement executed for side effects only — still need to evaluate reads
        this.generateExpr(stmt.expr);
        break;
      }
    }
  }

  private generateExpr(node: Expr): string {
    switch (node.kind) {
      case "read":
        return this.generateRead(node);
      case "number":
        return String(node.value);
      case "binop":
        return `(${this.generateExpr(
          node.left,
        )} ${node.op} ${this.generateExpr(node.right)})`;
      case "ident": {
        if (!this.declaredVars.has(node.name)) {
          throw new Error(`Undefined variable '${node.name}'`);
        }
        return node.name;
      }
    }
  }

  private generateRead(node: ReadExpr): string {
    const idx = this.readIndex++;
    let parseFn: string;
    switch (node.typeArg) {
      case "U8":
        parseFn = `(Math.floor(Number(tokens[${idx}])) & 0xFF)`;
        break;
      case "I8":
        parseFn = `((Math.floor(Number(tokens[${idx}])) + 128) % 256 - 128)`;
        break;
      case "U16":
        parseFn = `(Math.floor(Number(tokens[${idx}])) & 0xFFFF)`;
        break;
      case "I16":
        parseFn = `((Math.floor(Number(tokens[${idx}])) + 32768) % 65536 - 32768)`;
        break;
      case "U32":
        parseFn = `(Math.trunc(Number(tokens[${idx}])) >>> 0)`;
        break;
      case "I32":
        parseFn = `(Math.trunc(Number(tokens[${idx}])) | 0)`;
        break;
      default:
        throw new Error(`Unsupported read type '${node.typeArg}'`);
    }
    return parseFn;
  }
}

export function compileTuffToTS(tuffSourceCode: string): string {
  const trimmed = tuffSourceCode.trim();
  if (!trimmed) return "return 0";
  const tokens = tokenize(trimmed);
  const parser = new Parser(tokens);
  const statements = parser.parseProgram();
  const gen = new Generator();
  return gen.generate(statements);
}
