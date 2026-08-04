import type { Token } from "./tokenizer";

export type Expr =
  | { type: "number"; value: number }
  | { type: "binary"; operator: string; left: Expr; right: Expr };

export function parse(tokens: Token[]): Expr {
  let index = 0;

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
    if (token.type === "lparen" || token.type === "lbrace") {
      const expr = parseExpression();
      index++; // consume ")" or "}"
      return expr;
    }
    throw new Error("Unexpected token");
  }

  return parseExpression();
}
