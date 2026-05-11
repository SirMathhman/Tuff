// TUFF → TypeScript compiler

type TokenType =
  | "IDENT"
  | "NUMBER"
  | "LT"
  | "GT"
  | "LPAREN"
  | "RPAREN"
  | "PLUS";

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

// AST nodes
type AstNode = ReadExpr | NumberLit | BinOp;

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
  left: AstNode;
  right: AstNode;
}

// --- Recursive descent parser with operator precedence ---

class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  parse(): AstNode | null {
    if (this.tokens.length === 0) return null;
    const expr = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new Error(
        `Unexpected token '${this.tokens[this.pos]!.value}' at position ${this.pos}`
      );
    }
    return expr;
  }

  // parseExpression handles addition (lowest precedence we support now)
  private parseExpression(): AstNode {
    let left = this.parsePrimary();

    while (
      this.pos < this.tokens.length &&
      this.tokens[this.pos]!.type === "PLUS"
    ) {
      const opToken = this.tokens[this.pos]!;
      if (opToken.type !== "PLUS") break;
      this.pos++; // consume '+'
      const right = this.parsePrimary();
      left = { kind: "binop", op: "+", left, right };
    }

    return left;
  }

  // parsePrimary handles atoms: read<T>(), number literals, parenthesized expressions
  private parsePrimary(): AstNode {
    const tok = this.tokens[this.pos]!;

    // Parenthesized expression
    if (tok.type === "LPAREN") {
      this.pos++; // consume '('
      const expr = this.parseExpression();
      if (!this.tokens[this.pos] || this.tokens[this.pos]!.type !== "RPAREN") {
        throw new Error("Expected ')'");
      }
      this.pos++; // consume ')'
      return expr;
    }

    // read<T>()
    if (tok.type === "IDENT" && tok.value === "read") {
      this.pos++; // consume 'read'
      const typeArg = this.parseTypeArgument();
      if (!this.tokens[this.pos] || this.tokens[this.pos]!.type !== "LPAREN") {
        throw new Error("Expected '(' after read<T>");
      }
      this.pos++; // consume '('
      if (!this.tokens[this.pos] || this.tokens[this.pos]!.type !== "RPAREN") {
        throw new Error("Expected ')' in read expression");
      }
      this.pos++; // consume ')'
      return { kind: "read", typeArg };
    }

    // number literal
    if (tok.type === "NUMBER") {
      this.pos++;
      return { kind: "number", value: parseInt(tok.value, 10) };
    }

    throw new Error(`Unexpected token '${tok.value}'`);
  }

  private parseTypeArgument(): string {
    if (!this.tokens[this.pos] || this.tokens[this.pos]!.type !== "LT") {
      throw new Error("Expected '<' after 'read'");
    }
    this.pos++; // consume '<'

    let typeArg = "";
    while (
      this.pos < this.tokens.length &&
      this.tokens[this.pos]!.type !== "GT"
    ) {
      typeArg += this.tokens[this.pos]!.value;
      this.pos++;
    }

    if (!this.tokens[this.pos] || this.tokens[this.pos]!.type !== "GT") {
      throw new Error("Missing '>' in read expression");
    }
    this.pos++; // consume '>'

    return typeArg;
  }
}

function parse(tokens: Token[]): AstNode | null {
  const parser = new Parser(tokens);
  return parser.parse();
}

// --- Code generation with stdin token index tracking ---

class Generator {
  private readIndex = 0; // tracks which stdin token each read<T>() consumes

  generate(ast: AstNode | null): string {
    if (!ast) return "";
    const exprCode = this.generateExpr(ast);
    return `const tokens = stdIn.trim().split(/\\s+/);\nreturn ${exprCode};`;
  }

  private generateExpr(node: AstNode): string {
    switch (node.kind) {
      case "read":
        return this.generateRead(node);
      case "number":
        return String(node.value);
      case "binop":
        return `(${this.generateExpr(node.left)} ${node.op} ${this.generateExpr(
          node.right
        )})`;
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
  const ast = parse(tokens);
  const gen = new Generator();
  return gen.generate(ast);
}
