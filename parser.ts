import type { Token } from "./lexer";

export type Node =
  | { type: "number"; value: number }
  | { type: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node };

export function parse(tokens: Token[]): Node {
  let pos = 0;

  function parseAdditive(): Node {
    let left = parseMultiplicative();
    while (tokens[pos]?.type === "plus" || tokens[pos]?.type === "minus") {
      const op = tokens[pos++].type === "plus" ? "+" : "-";
      const right = parseMultiplicative();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  function parseMultiplicative(): Node {
    let left = parsePrimary();
    while (tokens[pos]?.type === "star" || tokens[pos]?.type === "slash") {
      const op = tokens[pos++].type === "star" ? "*" : "/";
      const right = parsePrimary();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  function parsePrimary(): Node {
    const token = tokens[pos++];
    if (token?.type === "number") {
      return { type: "number", value: token.value };
    }
    if (token?.type === "lparen") {
      const node = parseAdditive();
      pos++; // consume rparen
      return node;
    }
    throw new Error("Unexpected token");
  }

  return parseAdditive();
}
