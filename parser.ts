import type { Token } from "./tokenizer";

export type Expr =
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "identifier"; name: string }
  | { type: "binary"; operator: string; left: Expr; right: Expr }
  | { type: "block"; statements: Stmt[] };

export type Stmt =
  | { type: "let"; name: string; mut: boolean; value: Expr }
  | { type: "assign"; name: string; value: Expr }
  | { type: "expr"; expr: Expr };

export type Program = { statements: Stmt[] };

const binaryOperators = new Map<Token["type"], { symbol: string; precedence: number }>([
  ["or", { symbol: "||", precedence: 1 }],
  ["equalsEquals", { symbol: "==", precedence: 2 }],
  ["plus", { symbol: "+", precedence: 3 }],
  ["minus", { symbol: "-", precedence: 3 }],
  ["star", { symbol: "*", precedence: 4 }],
  ["slash", { symbol: "/", precedence: 4 }],
]);

export function parse(tokens: Token[]): Program {
  let index = 0;

  function current(): Token {
    return tokens[index]!;
  }

  function parseBlock(): Expr {
    const statements: Stmt[] = [];
    while (index < tokens.length && current().type !== "rbrace") {
      statements.push(parseStatement());
    }
    index++; // consume "}"
    return { type: "block", statements };
  }

  function parseStatement(): Stmt {
    const token = current();
    if (token.type === "identifier" && token.name === "let") {
      index++; // consume "let"
      let mut = false;
      const next = tokens[index];
      if (next?.type === "identifier" && next.name === "mut") {
        mut = true;
        index++; // consume "mut"
      }
      const name = tokens[index++]!;
      if (name.type !== "identifier") {
        throw new Error("Expected identifier after let");
      }
      index++; // consume "="
      const value = parseExpression();
      if (tokens[index]?.type === "semicolon") {
        index++;
      }
      return { type: "let", name: name.name, mut, value };
    }
    const expr = parseExpression();
    if (tokens[index]?.type === "equals") {
      index++; // consume "="
      const value = parseExpression();
      if (tokens[index]?.type === "semicolon") {
        index++;
      }
      if (expr.type !== "identifier") {
        throw new Error("Assignment target must be an identifier");
      }
      return { type: "assign", name: expr.name, value };
    }
    if (tokens[index]?.type === "semicolon") {
      index++;
    }
    return { type: "expr", expr };
  }

  function parseExpression(minPrecedence = 0): Expr {
    let left = parsePrimary();
    while (index < tokens.length) {
      const op = binaryOperators.get(current().type);
      if (!op || op.precedence < minPrecedence) {
        break;
      }
      index++;
      const right = parseExpression(op.precedence + 1);
      left = { type: "binary", operator: op.symbol, left, right };
    }
    return left;
  }

  function parsePrimary(): Expr {
    const token = tokens[index++]!;
    if (token.type === "number") {
      return { type: "number", value: token.value };
    }
    if (token.type === "boolean") {
      return { type: "boolean", value: token.value };
    }
    if (token.type === "identifier") {
      return { type: "identifier", name: token.name };
    }
    if (token.type === "lparen") {
      const expr = parseExpression();
      index++; // consume ")"
      return expr;
    }
    if (token.type === "lbrace") {
      return parseBlock();
    }
    throw new Error("Unexpected token");
  }

  function parseProgram(): Program {
    const statements: Stmt[] = [];
    while (index < tokens.length) {
      statements.push(parseStatement());
    }
    return { statements };
  }

  return parseProgram();
}
