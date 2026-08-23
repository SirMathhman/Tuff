import type { EvalError, Position } from "./errors.ts";
import type { Token, TokenKind } from "./lexer.ts";
import { Err, Ok, andThen, map } from "./result.ts";
import type { Result } from "./result.ts";

export type Expr =
  | { readonly type: "number"; readonly value: number; readonly position: Position }
  | { readonly type: "boolean"; readonly value: boolean; readonly position: Position }
  | { readonly type: "identifier"; readonly name: string; readonly position: Position }
  | {
      readonly type: "unary";
      readonly op: string;
      readonly operand: Expr;
      readonly position: Position;
    }
  | {
      readonly type: "ref";
      readonly mutable: boolean;
      readonly operand: Expr;
      readonly position: Position;
    }
  | { readonly type: "deref"; readonly operand: Expr; readonly position: Position }
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
      readonly target: Expr;
      readonly value: Expr;
      readonly position: Position;
    }
  | { readonly type: "return"; readonly value: Expr; readonly position: Position }
  | {
      readonly type: "block";
      readonly statements: readonly Statement[];
      readonly position: Position;
    };

export interface Program {
  readonly statements: readonly Statement[];
}

const EOF: Token = { kind: "eof", value: "", position: { line: 0, column: 0 } };

function err(kind: EvalError["kind"], message: string, position: Position): EvalError {
  return { kind, message, position, snippet: "" };
}

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

  private expect(kind: TokenKind, what: string): Result<Token, EvalError> {
    const t = this.peek();
    if (t.kind !== kind) {
      return Err(
        err("syntax", `Expected ${what} but found "${t.value || "end of input"}"`, t.position),
      );
    }
    return Ok(this.advance());
  }

  parse(): Result<Program, EvalError> {
    const statements: Statement[] = [];
    while (this.peek().kind !== "eof") {
      const stmt = this.parseStatement();
      if (!stmt.ok) return Err(stmt.error);
      statements.push(stmt.value);
    }
    return Ok({ statements });
  }

  private parseStatement(): Result<Statement, EvalError> {
    const t = this.peek();
    if (t.kind === "keyword" && t.value === "let") {
      return this.parseLet(t);
    }
    if (t.kind === "keyword" && t.value === "return") {
      return this.parseReturn(t);
    }
    if (t.kind === "identifier") {
      return this.parseAssign(t);
    }
    if (t.kind === "operator" && t.value === "*") {
      return this.parseDerefAssign(t);
    }
    if (t.kind === "lbrace") {
      return this.parseBlock(t);
    }
    return Err(err("syntax", `Unexpected token "${t.value || "end of input"}"`, t.position));
  }

  private parseBlock(t: Token): Result<Statement, EvalError> {
    this.advance();
    const statements: Statement[] = [];
    while (this.peek().kind !== "rbrace" && this.peek().kind !== "eof") {
      const stmt = this.parseStatement();
      if (!stmt.ok) return stmt;
      statements.push(stmt.value);
    }
    return map(this.expect("rbrace", "'}'"), () => ({
      type: "block",
      statements,
      position: t.position,
    }));
  }

  private parseLet(t: Token): Result<Statement, EvalError> {
    this.advance();
    let mutable = false;
    if (this.peek().kind === "keyword" && this.peek().value === "mut") {
      this.advance();
      mutable = true;
    }
    return andThen(this.expect("identifier", "a variable name"), (nameTok) =>
      andThen(this.expect("operator", "'='"), () =>
        andThen(this.parseExpr(), (value) =>
          andThen(this.expect("semicolon", "';'"), () =>
            Ok({ type: "let", mutable, name: nameTok.value, value, position: t.position }),
          ),
        ),
      ),
    );
  }

  private parseReturn(t: Token): Result<Statement, EvalError> {
    this.advance();
    return andThen(this.parseExpr(), (value) =>
      andThen(this.expect("semicolon", "';'"), () =>
        Ok({ type: "return", value, position: t.position }),
      ),
    );
  }

  private parseAssign(t: Token): Result<Statement, EvalError> {
    this.advance();
    const target: Expr = { type: "identifier", name: t.value, position: t.position };
    return andThen(this.expect("operator", "'='"), () =>
      andThen(this.parseExpr(), (value) =>
        andThen(this.expect("semicolon", "';'"), () =>
          Ok({ type: "assign", target, value, position: t.position }),
        ),
      ),
    );
  }

  private parseDerefAssign(t: Token): Result<Statement, EvalError> {
    this.advance();
    return andThen(this.expect("identifier", "a variable name"), (nameTok) =>
      andThen(this.expect("operator", "'='"), () =>
        andThen(this.parseExpr(), (value) =>
          andThen(this.expect("semicolon", "';'"), () =>
            Ok({
              type: "assign",
              target: {
                type: "deref",
                operand: { type: "identifier", name: nameTok.value, position: nameTok.position },
                position: t.position,
              },
              value,
              position: t.position,
            }),
          ),
        ),
      ),
    );
  }

  private parseExpr(): Result<Expr, EvalError> {
    return this.parseAdditive();
  }

  private parseAdditive(): Result<Expr, EvalError> {
    let left = this.parseMultiplicative();
    while (left.ok) {
      const t = this.peek();
      if (t.kind === "operator" && (t.value === "+" || t.value === "-")) {
        this.advance();
        const right = this.parseMultiplicative();
        if (!right.ok) return right;
        left = Ok({
          type: "binary",
          op: t.value,
          left: left.value,
          right: right.value,
          position: left.value.position,
        });
      } else {
        break;
      }
    }
    return left;
  }

  private parseMultiplicative(): Result<Expr, EvalError> {
    let left = this.parseUnary();
    while (left.ok) {
      const t = this.peek();
      if (t.kind === "operator" && (t.value === "*" || t.value === "/" || t.value === "%")) {
        this.advance();
        const right = this.parseUnary();
        if (!right.ok) return right;
        left = Ok({
          type: "binary",
          op: t.value,
          left: left.value,
          right: right.value,
          position: left.value.position,
        });
      } else {
        break;
      }
    }
    return left;
  }

  private parseUnary(): Result<Expr, EvalError> {
    const t = this.peek();
    if (t.kind === "operator" && t.value === "-") {
      this.advance();
      return andThen(this.parseUnary(), (operand) =>
        Ok({ type: "unary", op: "-", operand, position: t.position }),
      );
    }
    if (t.kind === "operator" && t.value === "&") {
      this.advance();
      let mutable = false;
      if (this.peek().kind === "keyword" && this.peek().value === "mut") {
        this.advance();
        mutable = true;
      }
      return andThen(this.parseUnary(), (operand) =>
        Ok({ type: "ref", mutable, operand, position: t.position }),
      );
    }
    if (t.kind === "operator" && t.value === "*") {
      this.advance();
      return andThen(this.parseUnary(), (operand) =>
        Ok({ type: "deref", operand, position: t.position }),
      );
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Result<Expr, EvalError> {
    const t = this.peek();
    if (t.kind === "number") {
      this.advance();
      return Ok({ type: "number", value: Number(t.value), position: t.position });
    }
    if (t.kind === "keyword" && (t.value === "true" || t.value === "false")) {
      this.advance();
      return Ok({ type: "boolean", value: t.value === "true", position: t.position });
    }
    if (t.kind === "identifier") {
      this.advance();
      return Ok({ type: "identifier", name: t.value, position: t.position });
    }
    if (t.kind === "lparen") {
      this.advance();
      return andThen(this.parseExpr(), (inner) =>
        andThen(this.expect("rparen", "')'"), () => Ok(inner)),
      );
    }
    return Err(
      err("syntax", `Expected an expression but found "${t.value || "end of input"}"`, t.position),
    );
  }
}

export function parse(tokens: readonly Token[]): Result<Program, EvalError> {
  return new Parser(tokens).parse();
}
