import type { Token, AST } from "./types";

export class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): AST {
    const statements = this.parseStatements(false);
    return { type: "block", statements };
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
    let left = this.parseComparison();

    while (true) {
      const token = this.peek();
      if (token && token.type === "operator" && (token.value === "+" || token.value === "-")) {
        this.consume();
        const right = this.parseComparison();
        left = { type: "binary", operator: token.value, left, right };
      } else {
        break;
      }
    }

    return left;
  }

  private parseComparison(): AST {
    let left = this.parseAssignment();

    while (true) {
      const token = this.peek();
      if (
        token &&
        token.type === "operator" &&
        (token.value === "<" || token.value === ">" || token.value === "<=" || token.value === ">=" || token.value === "==" || token.value === "!=")
      ) {
        this.consume();
        const right = this.parseAssignment();
        left = { type: "binary", operator: token.value, left, right };
      } else {
        break;
      }
    }

    return left;
  }

  private parseAssignment(): AST {
    const left = this.parseMultiplicative();
    const token = this.peek();
    if (
      token &&
      token.type === "operator" &&
      (token.value === "=" || token.value === "+=" || token.value === "-=" || token.value === "*=" || token.value === "/=")
    ) {
      if (left.type !== "identifier") {
        throw new Error(`Invalid assignment target: ${JSON.stringify(left)}`);
      }
      this.consume();
      const value = this.parseAssignment();
      return { type: "assign", name: left.name, operator: token.value, value };
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
    if (token.type === "boolean") {
      return { type: "boolean", value: token.value };
    }
    if (token.type === "identifier" && token.value === "if") {
      return this.parseIf();
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
    const statements = this.parseStatements(true);
    return { type: "block", statements };
  }

  private parseIf(): AST {
    const open = this.consume();
    if (open.type !== "paren" || open.value !== "(") {
      throw new Error(`Expected ( after if, got: ${JSON.stringify(open)}`);
    }
    const condition = this.parseAdditive();
    const close = this.consume();
    if (close.type !== "paren" || close.value !== ")") {
      throw new Error(`Expected ) after if condition, got: ${JSON.stringify(close)}`);
    }
    const then = this.parseBracedBlock();
    let elseBranch: AST | null = null;
    const next = this.peek();
    if (next && next.type === "identifier" && next.value === "else") {
      this.consume();
      elseBranch = this.parseBracedBlock();
    }
    return { type: "if", condition, then, else: elseBranch };
  }

  private parseBracedBlock(): AST {
    const open = this.consume();
    if (open.type !== "paren" || open.value !== "{") {
      throw new Error(`Expected {, got: ${JSON.stringify(open)}`);
    }
    const statements = this.parseStatements(true);
    return { type: "block", statements };
  }

  private parseStatements(inBlock: boolean): AST[] {
    const statements: AST[] = [];

    while (true) {
      const token = this.peek();
      if (!token) {
        if (inBlock) {
          throw new Error("Unexpected end of input in block");
        }
        break;
      }
      if (token.type === "paren" && token.value === "}") {
        if (inBlock) {
          this.consume();
          break;
        }
        throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
      }
      if (token.type === "identifier" && token.value === "else") {
        if (inBlock) {
          break;
        }
        throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
      }

      statements.push(this.parseStatement());

      const next = this.peek();
      if (next && next.type === "semicolon") {
        this.consume();
      }
    }

    return statements;
  }

  private parseStatement(): AST {
    const token = this.peek();
    if (token && token.type === "identifier" && token.value === "let") {
      return this.parseLet();
    }
    return this.parseAdditive();
  }

  private parseLet(): AST {
    this.consume();
    let mutable = false;
    let nameToken = this.peek();
    if (nameToken && nameToken.type === "identifier" && nameToken.value === "mut") {
      this.consume();
      mutable = true;
      nameToken = this.peek();
    }
    if (!nameToken || nameToken.type !== "identifier") {
      throw new Error(`Expected identifier after let, got: ${JSON.stringify(nameToken)}`);
    }
    this.consume();
    const eq = this.consume();
    if (eq.type !== "operator" || eq.value !== "=") {
      throw new Error(`Expected = after let ${nameToken.value}, got: ${JSON.stringify(eq)}`);
    }
    const value = this.parseAdditive();
    return { type: "let", name: nameToken.value, mutable, value };
  }
}

export function parse(tokens: Token[]): AST {
  return new Parser(tokens).parse();
}
