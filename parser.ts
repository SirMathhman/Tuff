import type { Token } from "./lexer";
import { ParseError } from "./errors";

export type Node =
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | { type: "binary"; op: "+" | "-" | "*" | "/"; left: Node; right: Node }
  | { type: "let"; name: string; value: Node }
  | { type: "block"; statements: Node[] };

export function parse(tokens: Token[]): Node {
  let pos = 0;

  function parseBlock(): Node {
    const statements: Node[] = [];
    if (tokens[pos]?.type === "lbrace") {
      pos++;
      while (tokens[pos]?.type !== "rbrace" && pos < tokens.length) {
        statements.push(parseStatement());
      }
      pos++; // consume rbrace
    } else {
      statements.push(parseStatement());
    }
    return { type: "block", statements };
  }

  function parseStatement(): Node {
    if (tokens[pos]?.type === "let") {
      pos++;
      const name = (tokens[pos++] as { type: "identifier"; name: string }).name;
      pos++; // consume assign
      const value = parseAdditive();
      if (tokens[pos]?.type === "semicolon") {
        pos++;
      }
      return { type: "let", name, value };
    }
    const expr = parseAdditive();
    if (tokens[pos]?.type === "semicolon") {
      pos++;
    }
    return expr;
  }

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
    if (token?.type === "identifier") {
      return { type: "identifier", name: token.name };
    }
    if (token?.type === "lparen") {
      const node = parseAdditive();
      pos++; // consume rparen
      return node;
    }
    if (token?.type === "lbrace") {
      pos--; // let parseBlock consume the lbrace
      return parseBlock();
    }
    throw new ParseError("Unexpected token", pos - 1);
  }

  return parseAdditive();
}
