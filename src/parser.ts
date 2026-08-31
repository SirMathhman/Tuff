import type { Token } from "./lexer.ts";
import type { AstNode } from "./ast.ts";
import type { EvalError } from "./errors.ts";

export type ParseResult =
  | { ok: true; ast: AstNode }
  | { ok: false; error: EvalError };

export function parse(tokens: Token[]): ParseResult {
  // Grammar rule: empty input (only the end token) evaluates to 0.
  if (tokens.length === 1 && tokens[0]!.type === "end") {
    return { ok: true, ast: { type: "number", value: 0 } };
  }
  return new Parser(tokens).parseInput();
}

class Parser {
  private i = 0;

  constructor(private readonly tokens: Token[]) {}

  private next(): Token | undefined {
    return this.tokens[this.i];
  }

  private advance(): Token | undefined {
    return this.tokens[this.i++];
  }

  private parseNumber(): ParseResult {
    const tok = this.advance();
    if (tok === undefined || tok.type !== "number") {
      return {
        ok: false,
        error: {
          kind: "syntax",
          message: "expected a number",
          position: tok?.position ?? 0,
        },
      };
    }
    return { ok: true, ast: { type: "number", value: tok.value } };
  }

  // factor := number | '(' expr ')' | '{' expr '}'
  private parseFactor(): ParseResult {
    const tok = this.next();
    if (tok === undefined || (tok.type !== "lparen" && tok.type !== "lbrace")) {
      return this.parseNumber();
    }
    this.advance();
    const inner = this.parseExpr();
    if (!inner.ok) {
      return inner;
    }
    const expected = tok.type === "lparen" ? "rparen" : "rbrace";
    const close = this.next();
    if (close === undefined || close.type !== expected) {
      return {
        ok: false,
        error: {
          kind: "syntax",
          message: `expected ${tok.type === "lparen" ? ")" : "}"}`,
          position: close?.position ?? 0,
        },
      };
    }
    this.advance();
    return { ok: true, ast: inner.ast };
  }

  // term := factor ('*' factor)*, left-associative
  private parseTerm(): ParseResult {
    const left = this.parseFactor();
    if (!left.ok) {
      return left;
    }
    let ast = left.ast;
    for (;;) {
      const op = this.next();
      if (op === undefined || op.type !== "star") {
        break;
      }
      this.advance();
      const right = this.parseFactor();
      if (!right.ok) {
        return right;
      }
      ast = { type: "mul", left: ast, right: right.ast };
    }
    return { ok: true, ast };
  }

  // expr := term (('+' | '-') term)*, left-associative
  private parseExpr(): ParseResult {
    const left = this.parseTerm();
    if (!left.ok) {
      return left;
    }
    let ast = left.ast;
    for (;;) {
      const op = this.next();
      if (op === undefined || (op.type !== "plus" && op.type !== "minus")) {
        break;
      }
      this.advance();
      const right = this.parseTerm();
      if (!right.ok) {
        return right;
      }
      ast =
        op.type === "plus"
          ? { type: "add", left: ast, right: right.ast }
          : { type: "sub", left: ast, right: right.ast };
    }
    return { ok: true, ast };
  }

  parseInput(): ParseResult {
    const result = this.parseExpr();
    if (!result.ok) {
      return result;
    }
    const trailing = this.next();
    if (trailing === undefined || trailing.type !== "end") {
      return {
        ok: false,
        error: {
          kind: "syntax",
          message: "expected end of input",
          position: trailing?.position ?? 0,
        },
      };
    }
    return { ok: true, ast: result.ast };
  }
}
