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
    if (token.type === "identifier") {
      return { type: "identifier", name: token.value };
    }
    if (token.type === "operator" && token.value === "-") {
      return { type: "unary", operator: "-", operand: this.parsePrimary() };
    }
    if (token.type === "paren" && token.value === "{") {
      return this.parseBlock();
    }
    if (token.type === "paren" && token.value === "(") {
      const inner = this.parseAdditive();
      const closing = this.consume();
      if (closing.type !== "paren" || closing.value !== ")") {
        throw new Error(`Expected closing paren, got: ${JSON.stringify(closing)}`);
      }
      return inner;
    }
    throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
  }

  private parseBlock(): AST {
    const statements: AST[] = [];

    while (true) {
      const token = this.peek();
      if (!token) {
        throw new Error("Unexpected end of input in block");
      }
      if (token.type === "paren" && token.value === "}") {
        this.consume();
        break;
      }

      if (token.type === "identifier" && token.value === "let") {
        this.consume();
        const nameToken = this.consume();
        if (nameToken.type !== "identifier") {
          throw new Error(`Expected identifier after let, got: ${JSON.stringify(nameToken)}`);
        }
        const eq = this.consume();
        if (eq.type !== "operator" || eq.value !== "=") {
          throw new Error(`Expected = after let ${nameToken.value}, got: ${JSON.stringify(eq)}`);
        }
        const value = this.parseAdditive();
        statements.push({ type: "let", name: nameToken.value, value });
      } else {
        statements.push(this.parseAdditive());
      }

      const next = this.peek();
      if (next && next.type === "semicolon") {
        this.consume();
      }
    }

    return { type: "block", statements };
  }
}

export function parse(tokens: Token[]): AST {
  return new Parser(tokens).parse();
}
