import type { Token, AST } from "./types";

export class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): AST {
    const ast = this.parseAdditive();

    if (this.index < this.tokens.length) {
      throw new Error(`Unexpected trailing token: ${JSON.stringify(this.tokens[this.index])}`);
    }

    return ast;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private consume(): Token {
    const token = this.tokens[this.index];
    if (!token) {
      throw new Error("Unexpected end of input");
    }
    this.index++;
    return token;
  }

  private parseAdditive(): AST {
    let left = this.parseMultiplicative();

    while (true) {
      const token = this.peek();
      if (token && token.type === "operator" && (token.value === "+" || token.value === "-")) {
        this.consume();
        const right = this.parseMultiplicative();
        left = { type: "binary", operator: token.value, left, right };
      } else {
        break;
      }
    }

    return left;
  }

  private parseMultiplicative(): AST {
    let left = this.parsePrimary();

    while (true) {
      const token = this.peek();
      if (token && token.type === "operator" && (token.value === "*" || token.value === "/")) {
        this.consume();
        const right = this.parsePrimary();
        left = { type: "binary", operator: token.value, left, right };
      } else {
        break;
      }
    }

    return left;
  }

  private parsePrimary(): AST {
    const token = this.consume();
    if (token.type === "number") {
      return { type: "number", value: token.value };
    }
    if (token.type === "operator" && token.value === "-") {
      return { type: "unary", operator: "-", operand: this.parsePrimary() };
    }
    if (token.type === "paren" && (token.value === "(" || token.value === "{")) {
      const inner = this.parseAdditive();
      const closing = this.consume();
      const expected = token.value === "(" ? ")" : "}";
      if (closing.type !== "paren" || closing.value !== expected) {
        throw new Error(`Expected closing paren, got: ${JSON.stringify(closing)}`);
      }
      return inner;
    }
    throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
  }
}

export function parse(tokens: Token[]): AST {
  return new Parser(tokens).parse();
}
