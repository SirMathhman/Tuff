import type { Token } from "./tokens";
import type { Expr, Stmt } from "./ast";
import type { BinaryOp } from "./operators";

const BINARY_PRECEDENCE: Record<string, number> = {
  or: 1,
  and: 2,
  equals_equals: 3,
  plus: 4,
  minus: 4,
  star: 5,
};

const BINARY_OPERATOR: Record<string, BinaryOp> = {
  plus: "+",
  minus: "-",
  star: "*",
  or: "||",
  and: "&&",
  equals_equals: "==",
};

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
      const precedence = BINARY_PRECEDENCE[type];
      if (precedence === undefined || precedence < minPrecedence) {
        break;
      }
      advance();
      const right = parseBinary(precedence + 1);
      left = { kind: "binary", op: BINARY_OPERATOR[type]!, left, right };
    }

    return left;
  }

  function parseFactor(): Expr {
    const token = advance();

    if (token.type === "number") {
      return { kind: "number", value: token.value };
    }

    if (token.type === "true") {
      return { kind: "boolean", value: true };
    }

    if (token.type === "false") {
      return { kind: "boolean", value: false };
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
      const statements: Stmt[] = [];

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

  function parseStatement(): Stmt {
    if (peek().type === "let") {
      advance();
      const mutable = peek().type === "mut";
      if (mutable) {
        advance();
      }
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

      return { kind: "let", name: nameToken.name, mutable, value };
    }

    if (peek().type === "identifier" && tokens[index + 1]?.type === "equals") {
      const nameToken = advance();
      advance();
      const value = parseExpression();

      if (advance().type !== "semicolon") {
        throw new Error("Expected ; after assignment");
      }

      if (nameToken.type !== "identifier") {
        throw new Error("Expected identifier before =");
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
