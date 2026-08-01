// ---- Types ----

interface NumberToken {
  type: "number";
  value: number;
}
interface IdentifierToken {
  type: "identifier";
  name: string;
}
interface LetToken {
  type: "let";
}
interface EqualsToken {
  type: "equals";
}
interface SemicolonToken {
  type: "semicolon";
}
interface PlusToken {
  type: "plus";
}
interface MinusToken {
  type: "minus";
}
interface StarToken {
  type: "star";
}
interface SlashToken {
  type: "slash";
}
interface DotToken {
  type: "dot";
}
interface EOFToken {
  type: "eof";
}

type Token =
  | NumberToken
  | IdentifierToken
  | LetToken
  | EqualsToken
  | SemicolonToken
  | PlusToken
  | MinusToken
  | StarToken
  | SlashToken
  | DotToken
  | EOFToken;

interface NumberNode {
  kind: "number";
  value: number;
}
interface IdentifierNode {
  kind: "identifier";
  name: string;
}
interface MemberAccessNode {
  kind: "member_access";
  object: ASTNode;
  property: string;
}
interface BinaryOpNode {
  kind: "binary_op";
  left: ASTNode;
  op: string;
  right: ASTNode;
}
interface LetDeclNode {
  kind: "let_decl";
  name: string;
  value: ASTNode;
}

type ASTNode =
  NumberNode | IdentifierNode | MemberAccessNode | BinaryOpNode | LetDeclNode;

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
      if (name === "let") {
        tokens.push({ type: "let" });
      } else {
        tokens.push({ type: "identifier", name });
      }
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
    if (char === "=") {
      tokens.push({ type: "equals" });
      i++;
      continue;
    }
    if (char === ";") {
      tokens.push({ type: "semicolon" });
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

  // Parse a single statement
  parseStatement(): ASTNode {
    if (this.peek().type === "let") {
      return this.parseLetDecl();
    }

    // Expression statement
    const expr = this.parseExpression();
    // Consume optional trailing semicolon
    if (this.peek().type === "semicolon") {
      this.consume();
    }
    return expr;
  }

  // Parse: let <identifier> = <expression> ;
  parseLetDecl(): ASTNode {
    this.consume(); // consume 'let'
    const nameToken = this.consume();
    if (nameToken.type !== "identifier") {
      throw new Error(`Expected identifier after let, got ${nameToken.type}`);
    }

    if (this.peek().type !== "equals") {
      throw new Error(`Expected '=' in let declaration`);
    }
    this.consume(); // consume '='

    const value = this.parseExpression();

    // Consume optional trailing semicolon
    if (this.peek().type === "semicolon") {
      this.consume();
    }

    return { kind: "let_decl", name: nameToken.name, value };
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

    default:
      throw new Error(`Unexpected node kind in codegen`);
  }
}

// ---- Semantic Analysis ----

class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeError";
  }
}

function validateScope(stmts: ASTNode[], initialScope: Set<string>): void {
  const scope = new Set(initialScope);

  function checkNode(node: ASTNode): void {
    switch (node.kind) {
      case "number":
        // Always valid
        break;

      case "identifier":
        if (!scope.has(node.name)) {
          throw new ScopeError(`Undeclared identifier: '${node.name}'`);
        }
        break;

      case "member_access":
        // Only validate the object (the base identifier), property access is always valid
        checkNode(node.object);
        break;

      case "binary_op":
        checkNode(node.left);
        checkNode(node.right);
        break;

      case "let_decl":
        // Validate the value expression first (RHS)
        checkNode(node.value);
        // Then add the new variable to scope
        scope.add(node.name);
        break;
    }
  }

  for (const stmt of stmts) {
    checkNode(stmt);
  }
}

// ---- Compiler Entry Point ----

const IMPLICIT_PREFIX = "in let args : &[Str]; ";

export function compileTuffToJS(source: string): string {
  // Strip the implicit declaration prefix
  const userSource = source.startsWith(IMPLICIT_PREFIX)
    ? source.slice(IMPLICIT_PREFIX.length)
    : source;
  const trimmed = userSource.trim();
  if (trimmed === "") {
    return "process.exit(0);";
  }

  const tokens = tokenize(trimmed);
  const parser = new Parser(tokens);

  // Parse all statements separated by semicolons
  const stmts: ASTNode[] = [];
  while (parser.peek().type !== "eof") {
    stmts.push(parser.parseStatement());
  }

  // Validate scoping: args is implicitly declared
  validateScope(stmts, new Set(["args"]));

  // Generate JS for all statements
  const parts: string[] = [];
  const declared = new Set<string>();
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]!;
    if (stmt.kind === "let_decl") {
      const isNew = !declared.has(stmt.name);
      declared.add(stmt.name);
      if (isNew) {
        if (i === stmts.length - 1) {
          parts.push(
            `let ${stmt.name} = ${generateJS(stmt.value)}; process.exit(${stmt.name});`,
          );
        } else {
          parts.push(`let ${stmt.name} = ${generateJS(stmt.value)};`);
        }
      } else {
        if (i === stmts.length - 1) {
          parts.push(`process.exit(${stmt.name} = ${generateJS(stmt.value)});`);
        } else {
          parts.push(`${stmt.name} = ${generateJS(stmt.value)};`);
        }
      }
    } else {
      if (i === stmts.length - 1) {
        parts.push(`process.exit(${generateJS(stmt)});`);
      } else {
        parts.push(`${generateJS(stmt)};`);
      }
    }
  }

  return parts.join(" ");
}
