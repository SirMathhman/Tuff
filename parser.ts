import type { Token } from "./tokenizer";

export type Expr =
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | { type: "binary"; operator: string; left: Expr; right: Expr }
  | { type: "block"; statements: Stmt[] };

export type Stmt =
  | { type: "let"; name: string; value: Expr }
  | { type: "expr"; expr: Expr };

export function parse(tokens: Token[]): Expr {
  let index = 0;

  function parseBlock(): Expr {
    const statements: Stmt[] = [];
    while (index < tokens.length && tokens[index].type !== "rbrace") {
      statements.push(parseStatement());
    }
    index++; // consume "}"
    return { type: "block", statements };
  }

  function parseStatement(): Stmt {
    const token = tokens[index];
    if (token.type === "identifier" && token.name === "let") {
      index++; // consume "let"
      const name = tokens[index++];
      if (name.type !== "identifier") {
        throw new Error("Expected identifier after let");
      }
      index++; // consume "="
      const value = parseExpression();
      if (tokens[index]?.type === "semicolon") {
        index++;
      }
      return { type: "let", name: name.name, value };
    }
    const expr = parseExpression();
    if (tokens[index]?.type === "semicolon") {
      index++;
    }
    return { type: "expr", expr };
  }

  function parseExpression(): Expr {
    let left = parseTerm();
    while (index < tokens.length && (tokens[index].type === "plus" || tokens[index].type === "minus")) {
      const operator = tokens[index].type === "plus" ? "+" : "-";
      index++;
      const right = parseTerm();
      left = { type: "binary", operator, left, right };
    }
    return left;
  }

  function parseTerm(): Expr {
    let left = parsePrimary();
    while (index < tokens.length && (tokens[index].type === "star" || tokens[index].type === "slash")) {
      const operator = tokens[index].type === "star" ? "*" : "/";
      index++;
      const right = parsePrimary();
      left = { type: "binary", operator, left, right };
    }
    return left;
  }

  function parsePrimary(): Expr {
    const token = tokens[index++];
    if (token.type === "number") {
      return { type: "number", value: token.value };
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

  return parseBlock();
}
