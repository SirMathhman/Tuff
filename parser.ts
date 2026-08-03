import type { Token } from "./tokens";
import type { Expr } from "./ast";

export function parse(tokens: Token[]): Expr {
  let index = 0;

  function peek(): Token {
    return tokens[index]!;
  }

  function advance(): Token {
    return tokens[index++]!;
  }

  function parseExpression(): Expr {
    let left = parseTerm();

    while (peek().type === "plus" || peek().type === "minus") {
      const op = advance().type === "plus" ? "+" : "-";
      const right = parseTerm();
      left = { kind: "binary", op, left, right };
    }

    return left;
  }

  function parseTerm(): Expr {
    let left = parseFactor();

    while (peek().type === "star") {
      advance();
      const right = parseFactor();
      left = { kind: "binary", op: "*", left, right };
    }

    return left;
  }

  function parseFactor(): Expr {
    const token = advance();

    if (token.type === "number") {
      return { kind: "number", value: token.value };
    }

    if (token.type === "identifier") {
      return { kind: "variable", name: token.name };
    }

    if (token.type === "lparen") {
      const expr = parseExpression();

      if (advance().type !== "rparen") {
        throw new Error("Expected closing parenthesis");
      }

      return expr;
    }

    if (token.type === "lbrace") {
      const statements: Expr[] = [];

      while (peek().type !== "rbrace" && peek().type !== "eof") {
        statements.push(parseStatement());
      }

      if (advance().type !== "rbrace") {
        throw new Error("Expected closing brace");
      }

      return { kind: "block", statements };
    }

    throw new Error(`Unexpected token: ${token.type}`);
  }

  function parseStatement(): Expr {
    if (peek().type === "let") {
      advance();
      const nameToken = advance();

      if (nameToken.type !== "identifier") {
        throw new Error("Expected identifier after let");
      }

      if (advance().type !== "equals") {
        throw new Error("Expected = in let declaration");
      }

      const value = parseExpression();

      if (advance().type !== "semicolon") {
        throw new Error("Expected ; after let declaration");
      }

      return { kind: "let", name: nameToken.name, value };
    }

    return parseExpression();
  }

  return parseStatement();
}
