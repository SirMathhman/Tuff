import type { Token, ASTNode } from "./ast";
import { PRECEDENCE } from "./ast";

export class Parser {
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

    // Check for assignment: identifier = expr
    if (this.peek().type === "equals") {
      if (expr.kind !== "identifier") {
        throw new Error("Left-hand side of assignment must be an identifier");
      }
      this.consume(); // consume '='
      const value = this.parseExpression();
      // Consume optional trailing semicolon
      if (this.peek().type === "semicolon") {
        this.consume();
      }
      return { kind: "assign", name: expr.name, value };
    }

    // Consume optional trailing semicolon
    if (this.peek().type === "semicolon") {
      this.consume();
    }
    return expr;
  }

  // Parse: let [mut] <identifier> = <expression> ;
  parseLetDecl(): ASTNode {
    this.consume(); // consume 'let'

    // Check for optional 'mut' keyword
    let isMut = false;
    if (this.peek().type === "mut") {
      isMut = true;
      this.consume(); // consume 'mut'
    }

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

    return { kind: "let_decl", name: nameToken.name, value, isMut };
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
