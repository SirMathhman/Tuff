import type { Token } from "./lexer";

export type AST =
  | { type: "number"; value: number }
  | { type: "binary"; operator: "+" | "-" | "*" | "/"; left: AST; right: AST }
  | { type: "unary"; operator: "-"; operand: AST };

export function parse(tokens: Token[]): AST {
  let index = 0;

  function peek(): Token | undefined {
    return tokens[index];
  }

  function consume(): Token {
    const token = tokens[index];
    if (!token) {
      throw new Error("Unexpected end of input");
    }
    index++;
    return token;
  }

  function parseAdditive(): AST {
    let left = parseMultiplicative();

    while (true) {
      const token = peek();
      if (token && token.type === "operator" && (token.value === "+" || token.value === "-")) {
        consume();
        const right = parseMultiplicative();
        left = { type: "binary", operator: token.value, left, right };
      } else {
        break;
      }
    }

    return left;
  }

  function parseMultiplicative(): AST {
    let left = parsePrimary();

    while (true) {
      const token = peek();
      if (token && token.type === "operator" && (token.value === "*" || token.value === "/")) {
        consume();
        const right = parsePrimary();
        left = { type: "binary", operator: token.value, left, right };
      } else {
        break;
      }
    }

    return left;
  }

  function parsePrimary(): AST {
    const token = consume();
    if (token.type === "number") {
      return { type: "number", value: token.value };
    }
    if (token.type === "operator" && token.value === "-") {
      return { type: "unary", operator: "-", operand: parsePrimary() };
    }
    if (token.type === "paren" && token.value === "(") {
      const inner = parseAdditive();
      const closing = consume();
      if (closing.type !== "paren" || closing.value !== ")") {
        throw new Error(`Expected closing paren, got: ${JSON.stringify(closing)}`);
      }
      return inner;
    }
    throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
  }

  const ast = parseAdditive();

  if (index < tokens.length) {
    throw new Error(`Unexpected trailing token: ${JSON.stringify(tokens[index])}`);
  }

  return ast;
}
