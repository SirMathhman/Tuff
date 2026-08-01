// ---- Types ----

type Token =
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | { type: "plus" }
  | { type: "minus" }
  | { type: "star" }
  | { type: "slash" }
  | { type: "dot" }
  | { type: "eof" };

type ASTNode =
  | { kind: "number"; value: number }
  | { kind: "identifier"; name: string }
  | { kind: "member_access"; object: ASTNode; property: string }
  | { kind: "binary_op"; left: ASTNode; op: string; right: ASTNode };

// ---- Tokenizer ----

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    // Skip whitespace
    if (
      source[i] === " " ||
      source[i] === "\t" ||
      source[i] === "\n" ||
      source[i] === "\r"
    ) {
      i++;
      continue;
    }

    // Number literal
    if (/[0-9]/.test(source[i]!)) {
      let num = "";
      while (i < source.length && /[0-9.]/.test(source[i]!)) {
        num += source[i];
        i++;
      }
      tokens.push({ type: "number", value: Number(num) });
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_$]/.test(source[i]!)) {
      let name = "";
      while (i < source.length && /[a-zA-Z0-9_$]/.test(source[i]!)) {
        name += source[i];
        i++;
      }
      tokens.push({ type: "identifier", name });
      continue;
    }

    // Single-character tokens
    const char = source[i]!;
    if (char === "+") {
      tokens.push({ type: "plus" });
      i++;
      continue;
    }
    if (char === "-") {
      tokens.push({ type: "minus" });
      i++;
      continue;
    }
    if (char === "*") {
      tokens.push({ type: "star" });
      i++;
      continue;
    }
    if (char === "/") {
      tokens.push({ type: "slash" });
      i++;
      continue;
    }
    if (char === ".") {
      tokens.push({ type: "dot" });
      i++;
      continue;
    }

    // Unknown character, skip
    i++;
  }

  tokens.push({ type: "eof" });
  return tokens;
}

// ---- Parser (recursive descent with precedence climbing) ----

const PRECEDENCE: Record<string, number> = {
  "+": 10,
  "-": 10,
  "*": 20,
  "/": 20,
};

class Parser {
  tokens: Token[];
  pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek(): Token {
    return this.tokens[this.pos]!;
  }

  consume(): Token {
    const token = this.tokens[this.pos]!;
    this.pos++;
    return token;
  }

  expect(type: Token["type"]): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new Error(`Expected ${type}, got ${token.type}`);
    }
    return this.consume();
  }

  // Parse a primary expression: number, identifier, or member access
  parsePrimary(): ASTNode {
    const token = this.peek();

    if (token.type === "number") {
      this.consume();
      return { kind: "number", value: token.value };
    }

    if (token.type === "identifier") {
      this.consume();
      let node: ASTNode = { kind: "identifier", name: token.name };

      // Handle member access (chained)
      while (this.peek().type === "dot") {
        this.consume(); // consume dot
        const propToken = this.consume();
        if (propToken.type !== "identifier") {
          throw new Error(
            `Expected identifier after dot, got ${propToken.type}`,
          );
        }
        node = {
          kind: "member_access",
          object: node,
          property: propToken.name,
        };
      }

      return node;
    }

    throw new Error(`Unexpected token: ${token.type}`);
  }

  // Parse binary expression with precedence climbing
  parseExpression(minPrec: number = 0): ASTNode {
    let left = this.parsePrimary();

    while (true) {
      const token = this.peek();
      const op = this.tokenToOp(token);
      if (op === null) break;

      const prec = PRECEDENCE[op] ?? 0;
      if (prec < minPrec) break;

      this.consume(); // consume operator
      const right = this.parseExpression(prec + 1);
      left = { kind: "binary_op", left, op, right };
    }

    return left;
  }

  private tokenToOp(token: Token): string | null {
    switch (token.type) {
      case "plus":
        return "+";
      case "minus":
        return "-";
      case "star":
        return "*";
      case "slash":
        return "/";
      default:
        return null;
    }
  }
}

// ---- Code Generator ----

function generateJS(node: ASTNode): string {
  switch (node.kind) {
    case "number":
      return String(node.value);

    case "identifier":
      return node.name;

    case "member_access":
      return `${generateJS(node.object)}[${JSON.stringify(node.property)}]`;

    case "binary_op":
      return `${generateJS(node.left)} ${node.op} ${generateJS(node.right)}`;
  }
}

// ---- Compiler Entry Point ----

export function compileTuffToJS(source: string): string {
  // If the user source (after the implicit declaration) is empty, return 0 exit code
  const lastSemicolon = source.lastIndexOf(";");
  const userSource =
    lastSemicolon >= 0 ? source.slice(lastSemicolon + 1) : source;
  const trimmed = userSource.trim();
  if (trimmed === "") {
    return "process.exit(0);";
  }

  const tokens = tokenize(trimmed);
  const parser = new Parser(tokens);
  const ast = parser.parseExpression();
  const jsExpr = generateJS(ast);
  return `__exit__ = ${jsExpr};`;
}
