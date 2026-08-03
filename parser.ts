import type { Token } from "./tokens";
import type { Expr, Stmt } from "./ast";
import { OPERATORS, TOKEN_TO_OPERATOR } from "./operators";
import { ParseError } from "./errors";

export function parse(tokens: Token[]): Stmt {
  let index = 0;

  function peek(): Token {
    return tokens[index]!;
  }

  function advance(): Token {
    return tokens[index++]!;
  }

  function parseExpression(): Expr {
    return parseBinary(0);
  }

  function parseBinary(minPrecedence: number): Expr {
    let left = parseFactor();

    while (true) {
      const type = peek().type;
      const op = TOKEN_TO_OPERATOR[type];
      if (op === undefined) {
        break;
      }
      const precedence = OPERATORS[op].precedence;
      if (precedence < minPrecedence) {
        break;
      }
      advance();
      const right = parseBinary(precedence + 1);
      left = { kind: "binary", op, left, right };
    }

    return left;
  }

  function parseNumber(): Expr {
    const token = advance();
    if (token.type !== "number") {
      throw new ParseError("Expected number");
    }
    return { kind: "number", value: token.value };
  }

  function parseBoolean(): Expr {
    const token = advance();
    return { kind: "boolean", value: token.type === "true" };
  }

  function parseVariable(): Expr {
    const token = advance();
    if (token.type !== "identifier") {
      throw new ParseError("Expected identifier");
    }
    return { kind: "variable", name: token.name };
  }

  function parseIf(): Expr {
    advance();
    if (advance().type !== "lparen") {
      throw new ParseError("Expected ( after if");
    }
    const condition = parseExpression();
    if (advance().type !== "rparen") {
      throw new ParseError("Expected ) after if condition");
    }
    const then = parseExpression();
    if (advance().type !== "else") {
      throw new ParseError("Expected else in if expression");
    }
    const otherwise = parseExpression();
    return { kind: "if", condition, then, otherwise };
  }

  function parseGrouped(): Expr {
    advance();
    const expr = parseExpression();

    if (advance().type !== "rparen") {
      throw new ParseError("Expected closing parenthesis");
    }

    return expr;
  }

  function parseBlock(): Expr {
    advance();
    const statements: Stmt[] = [];

    while (peek().type !== "rbrace" && peek().type !== "eof") {
      statements.push(parseStatement());
    }

    if (advance().type !== "rbrace") {
      throw new ParseError("Expected closing brace");
    }

    return { kind: "block", statements };
  }

  const PREFIX_PARSERS: Record<string, () => Expr> = {
    number: parseNumber,
    true: parseBoolean,
    false: parseBoolean,
    identifier: parseVariable,
    if: parseIf,
    lparen: parseGrouped,
    lbrace: parseBlock,
  };

  function parseFactor(): Expr {
    const type = peek().type;
    const parser = PREFIX_PARSERS[type];
    if (parser) {
      return parser();
    }
    throw new ParseError(`Unexpected token: ${type}`);
  }

  function parseStatement(): Stmt {
    if (peek().type === "let") {
      advance();
      const mutable = peek().type === "mut";
      if (mutable) {
        advance();
      }
      const nameToken = advance();

      if (nameToken.type !== "identifier") {
        throw new ParseError("Expected identifier after let");
      }

      if (advance().type !== "equals") {
        throw new ParseError("Expected = in let declaration");
      }

      const value = parseExpression();

      if (advance().type !== "semicolon") {
        throw new ParseError("Expected ; after let declaration");
      }

      return { kind: "let", name: nameToken.name, mutable, value };
    }

    if (peek().type === "identifier" && tokens[index + 1]?.type === "equals") {
      const nameToken = advance();
      advance();
      const value = parseExpression();

      if (advance().type !== "semicolon") {
        throw new ParseError("Expected ; after assignment");
      }

      if (nameToken.type !== "identifier") {
        throw new ParseError("Expected identifier before =");
      }

      return { kind: "assign", name: nameToken.name, value };
    }

    return { kind: "expr", expr: parseExpression() };
  }

  const statements: Stmt[] = [];

  while (peek().type !== "eof") {
    statements.push(parseStatement());
  }

  return { kind: "block", statements };
}
