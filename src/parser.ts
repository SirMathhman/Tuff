import type { AstNode } from "./ast";
import type { Token } from "./tokenizer";
import { OPENING } from "./grammar";

/**
 * Recursive-descent parser for the Tuff language.
 * Encapsulates mutable state (position, tokens) as class members.
 */
class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  /* ---- low-level token access ---- */

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  consume(): Token | undefined {
    return this.tokens[this.pos++];
  }

  match(type: string, value?: string): boolean {
    const t = this.peek();
    if (t?.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }

  expect(type: string, value?: string): Token {
    const t = this.peek();
    if (t?.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(
        `Expected ${type}${value !== undefined ? ` '${value}'` : ""}, got ${t?.type} '${t?.value}'`,
      );
    }
    return this.consume()!;
  }

  /* ---- public entry point ---- */

  parse(): AstNode {
    const statements: AstNode[] = [];
    while (this.pos < this.tokens.length) {
      statements.push(this.parseStatement());
    }
    if (statements.length === 0) return { kind: "number", value: 0 };
    if (statements.length === 1) return statements[0]!;
    return { kind: "block", statements };
  }

  /* ---- grammar rules ---- */

  private parseBlock(): AstNode {
    const statements: AstNode[] = [];
    while (this.pos < this.tokens.length) {
      if (this.match("group", "}")) {
        this.consume();
        break;
      }
      const prevPos = this.pos;
      const stmt = this.parseStatement();
      if (prevPos === this.pos) {
        this.pos++;
      }
      statements.push(stmt);
    }
    return { kind: "block", statements };
  }

  private parseStatement(): AstNode {
    if (this.match("keyword", "let")) {
      this.consume();
      const nameToken = this.peek();
      let name = "";
      if (nameToken?.type === "identifier") {
        name = nameToken.value;
        this.consume();
      }
      if (this.match("operator", "=")) {
        this.consume();
      }
      const value = this.parseExpression();
      if (this.match("punctuator", ";")) {
        this.consume();
      }
      return { kind: "let", name, value };
    }
    return this.parseExpression();
  }

  private parseAtom(): AstNode {
    if (this.match("number")) {
      const t = this.consume()!;
      return { kind: "number", value: t.value as number };
    }
    if (this.match("identifier")) {
      const t = this.consume()!;
      return { kind: "identifier", name: t.value as string };
    }
    const token = this.peek();
    if (token?.type === "group" && token.value in OPENING) {
      this.consume();
      if (token.value === "{") {
        return this.parseBlock();
      }
      const node = this.parseExpression();
      if (this.match("group", OPENING[token.value])) {
        this.consume();
      }
      return node;
    }
    return { kind: "number", value: 0 };
  }

  private parseTerm(): AstNode {
    let node = this.parseAtom();
    while (this.pos < this.tokens.length) {
      const op = this.peek();
      if (op?.type === "operator" && (op.value === "*" || op.value === "/")) {
        this.consume();
        const right = this.parseAtom();
        node = {
          kind: "binary",
          op: op.value as "+" | "-" | "*" | "/",
          left: node,
          right,
        };
      } else {
        break;
      }
    }
    return node;
  }

  private parseExpression(): AstNode {
    let node = this.parseTerm();
    while (this.pos < this.tokens.length) {
      const op = this.peek();
      if (
        op?.type === "operator" &&
        (op.value === "+" ||
          op.value === "-" ||
          op.value === "*" ||
          op.value === "/")
      ) {
        this.consume();
        const right = this.parseTerm();
        node = {
          kind: "binary",
          op: op.value as "+" | "-" | "*" | "/",
          left: node,
          right,
        };
      } else {
        break;
      }
    }
    return node;
  }
}

/**
 * Parse a token array into an AST node using recursive descent.
 *
 * Grammar (simplified):
 *   statement : let_decl | expression
 *   let_decl  : "let" IDENT "=" expression ";"
 *   block     : "{" statement* "}"
 *   expression: binary_op_chain
 *   atom      : NUMBER | IDENT | "(" expression ")" | block
 */
export function parse(tokens: Token[]): AstNode {
  return new Parser(tokens).parse();
}
