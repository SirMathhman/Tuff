import type { Token, ASTNode } from "./ast";
import { OPERATORS } from "./ast";
import type { Result } from "./result";
import { ok, err, andThen } from "./result";

export interface Parser {
  peek(): Token;
  parseStatement(): Result<ASTNode, Error>;
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
  function parsePrimary(): Result<ASTNode, Error> {
    const token = peek();

    if (token.type === "number") {
      consume();
      return ok({ kind: "number", value: token.value });
    }

    if (token.type === "boolean") {
      consume();
      return ok({ kind: "boolean", value: token.value });
    }

    if (token.type === "identifier") {
      consume();
      let node: ASTNode = { kind: "identifier", name: token.name };

      // Handle member access (chained)
      while (peek().type === "dot") {
        consume(); // consume dot
        const propToken = consume();
        if (propToken.type !== "identifier") {
          return err(
            new Error(`Expected identifier after dot, got ${propToken.type}`),
          );
        }
        node = {
          kind: "member_access",
          object: node,
          property: propToken.name,
        };
      }

      return ok(node);
    }

    return err(new Error(`Unexpected token: ${token.type}`));
  }

  // Parse binary expression with precedence climbing
  function parseExpression(minPrec: number = 0): Result<ASTNode, Error> {
    return andThen(parsePrimary(), (left) => {
      let node: ASTNode = left;

      while (true) {
        const token = peek();
        const info = OPERATORS.get(token.type);
        if (info === undefined) break;

        const prec = info.precedence;
        if (prec < minPrec) break;

        consume(); // consume operator
        const rightResult = parseExpression(prec + 1);
        if (!rightResult.ok) return rightResult;
        node = {
          kind: "binary_op",
          left: node,
          op: info.symbol,
          right: rightResult.value,
        };
      }

      return ok(node);
    });
  }

  // Parse: let [mut] <identifier> = <expression> ;
  function parseLetDecl(): Result<ASTNode, Error> {
    consume(); // consume 'let'

    // Check for optional 'mut' keyword
    let isMut = false;
    if (peek().type === "mut") {
      isMut = true;
      consume(); // consume 'mut'
    }

    const nameToken = consume();
    if (nameToken.type !== "identifier") {
      return err(
        new Error(`Expected identifier after let, got ${nameToken.type}`),
      );
    }

    if (peek().type !== "equals") {
      return err(new Error(`Expected '=' in let declaration`));
    }
    consume(); // consume '='

    return andThen(parseExpression(), (value) => {
      // Consume optional trailing semicolon
      if (peek().type === "semicolon") {
        consume();
      }

      return ok({
        kind: "let_decl",
        name: nameToken.name,
        value,
        isMut,
      });
    });
  }

  // Parse a single statement
  function parseStatement(): Result<ASTNode, Error> {
    if (peek().type === "let") {
      return parseLetDecl();
    }

    // Expression statement
    const exprResult = parseExpression();
    if (!exprResult.ok) return exprResult;
    const expr = exprResult.value;

    // Check for assignment: identifier = expr
    if (peek().type === "equals") {
      if (expr.kind !== "identifier") {
        return err(
          new Error("Left-hand side of assignment must be an identifier"),
        );
      }
      consume(); // consume '='
      return andThen(parseExpression(), (value) => {
        // Consume optional trailing semicolon
        if (peek().type === "semicolon") {
          consume();
        }
        return ok({ kind: "assign", name: expr.name, value });
      });
    }

    // Consume optional trailing semicolon
    if (peek().type === "semicolon") {
      consume();
    }
    return ok(expr);
  }

  return { peek, parseStatement };
}
