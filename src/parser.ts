import { TuffError } from "./errors.ts";
import type { Position } from "./errors.ts";
import type { Token, TokenKind } from "./lexer.ts";

export type Expr =
  | { readonly type: "number"; readonly value: number; readonly position: Position }
  | { readonly type: "identifier"; readonly name: string; readonly position: Position }
  | {
      readonly type: "unary";
      readonly op: string;
      readonly operand: Expr;
      readonly position: Position;
    }
  | {
      readonly type: "binary";
      readonly op: string;
      readonly left: Expr;
      readonly right: Expr;
      readonly position: Position;
    };

export type Statement =
  | {
      readonly type: "let";
      readonly mutable: boolean;
      readonly name: string;
      readonly value: Expr;
      readonly position: Position;
    }
  | {
      readonly type: "assign";
      readonly name: string;
      readonly value: Expr;
      readonly position: Position;
    }
  | { readonly type: "return"; readonly value: Expr; readonly position: Position };

export interface Program {
  readonly statements: readonly Statement[];
}

const EOF: Token = { kind: "eof", value: "", position: { line: 0, column: 0 } };

class Parser {
  private i = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  private peek(): Token {
    return this.tokens[this.i] ?? EOF;
  }

  private advance(): Token {
    const t = this.peek();
    this.i++;
    return t;
  }

  private expect(kind: TokenKind, what: string): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      throw new TuffError(
        "syntax",
        `Expected ${what} but found "${t.value || "end of input"}"`,
        t.position,
      );
    }
    return this.advance();
  }

  parse(): Program {
    const statements: Statement[] = [];
    while (this.peek().kind !== "eof") {
      statements.push(this.parseStatement());
    }
    return { statements };
  }

  private parseStatement(): Statement {
    const t = this.peek();
    if (t.kind === "keyword" && t.value === "let") {
      this.advance();
      let mutable = false;
      if (this.peek().kind === "keyword" && this.peek().value === "mut") {
        this.advance();
        mutable = true;
      }
      const name = this.expect("identifier", "a variable name").value;
      this.expect("operator", "'='");
      const value = this.parseExpr();
      this.expect("semicolon", "';'");
      return { type: "let", mutable, name, value, position: t.position };
    }
    if (t.kind === "keyword" && t.value === "return") {
      this.advance();
      const value = this.parseExpr();
      this.expect("semicolon", "';'");
      return { type: "return", value, position: t.position };
    }
    if (t.kind === "identifier") {
      this.advance();
      this.expect("operator", "'='");
      const value = this.parseExpr();
      this.expect("semicolon", "';'");
      return { type: "assign", name: t.value, value, position: t.position };
    }
    throw new TuffError("syntax", `Unexpected token "${t.value || "end of input"}"`, t.position);
  }

  private parseExpr(): Expr {
    return this.parseAdditive();
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (
      this.peek().kind === "operator" &&
      (this.peek().value === "+" || this.peek().value === "-")
    ) {
      const op = this.advance().value;
      const right = this.parseMultiplicative();
      left = { type: "binary", op, left, right, position: left.position };
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    while (
      this.peek().kind === "operator" &&
      (this.peek().value === "*" || this.peek().value === "/" || this.peek().value === "%")
    ) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = { type: "binary", op, left, right, position: left.position };
    }
    return left;
  }

  private parseUnary(): Expr {
    const t = this.peek();
    if (t.kind === "operator" && t.value === "-") {
      this.advance();
      const operand = this.parseUnary();
      return { type: "unary", op: "-", operand, position: t.position };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (t.kind === "number") {
      this.advance();
      return { type: "number", value: Number(t.value), position: t.position };
    }
    if (t.kind === "identifier") {
      this.advance();
      return { type: "identifier", name: t.value, position: t.position };
    }
    if (t.kind === "lparen") {
      this.advance();
      const inner = this.parseExpr();
      this.expect("rparen", "')'");
      return inner;
    }
    throw new TuffError(
      "syntax",
      `Expected an expression but found "${t.value || "end of input"}"`,
      t.position,
    );
  }
}

export function parse(tokens: readonly Token[]): Program {
  return new Parser(tokens).parse();
}
