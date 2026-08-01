import type { Token, ASTNode } from "./ast";
import { OPERATORS } from "./ast";

export interface Parser {
  peek(): Token;
  parseStatement(): ASTNode;
}

export function createParser(tokens: Token[]): Parser {
  let pos = 0;

  function peek(): Token {
    return tokens[pos]!;
  }

  function consume(): Token {
    const token = tokens[pos]!;
    pos++;
    return token;
  }

  // Parse a primary expression: number, boolean, identifier, or member access
  function parsePrimary(): ASTNode {
    const token = peek();

    if (token.type === "number") {
      consume();
      return { kind: "number", value: token.value };
    }

    if (token.type === "boolean") {
      consume();
      return { kind: "boolean", value: token.value };
    }

    if (token.type === "identifier") {
      consume();
      let node: ASTNode = { kind: "identifier", name: token.name };

      // Handle member access (chained)
      while (peek().type === "dot") {
        consume(); // consume dot
        const propToken = consume();
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
  function parseExpression(minPrec: number = 0): ASTNode {
    let left = parsePrimary();

    while (true) {
      const token = peek();
      const info = OPERATORS.get(token.type);
      if (info === undefined) break;

      const prec = info.precedence;
      if (prec < minPrec) break;

      consume(); // consume operator
      const right = parseExpression(prec + 1);
      left = { kind: "binary_op", left, op: info.symbol, right };
    }

    return left;
  }

  // Parse: let [mut] <identifier> = <expression> ;
  function parseLetDecl(): ASTNode {
    consume(); // consume 'let'

    // Check for optional 'mut' keyword
    let isMut = false;
    if (peek().type === "mut") {
      isMut = true;
      consume(); // consume 'mut'
    }

    const nameToken = consume();
    if (nameToken.type !== "identifier") {
      throw new Error(`Expected identifier after let, got ${nameToken.type}`);
    }

    if (peek().type !== "equals") {
      throw new Error(`Expected '=' in let declaration`);
    }
    consume(); // consume '='

    const value = parseExpression();

    // Consume optional trailing semicolon
    if (peek().type === "semicolon") {
      consume();
    }

    return { kind: "let_decl", name: nameToken.name, value, isMut };
  }

  // Parse a single statement
  function parseStatement(): ASTNode {
    if (peek().type === "let") {
      return parseLetDecl();
    }

    // Expression statement
    const expr = parseExpression();

    // Check for assignment: identifier = expr
    if (peek().type === "equals") {
      if (expr.kind !== "identifier") {
        throw new Error("Left-hand side of assignment must be an identifier");
      }
      consume(); // consume '='
      const value = parseExpression();
      // Consume optional trailing semicolon
      if (peek().type === "semicolon") {
        consume();
      }
      return { kind: "assign", name: expr.name, value };
    }

    // Consume optional trailing semicolon
    if (peek().type === "semicolon") {
      consume();
    }
    return expr;
  }

  return { peek, parseStatement };
}
