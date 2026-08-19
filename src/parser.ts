import type { AstNode } from "./ast.js";
import type { TuffError } from "./errors.js";
import type { Token } from "./lexer.js";
import type { SourcePosition } from "./position.js";
import type { Result } from "./result.js";

/**
 * A recursive-descent parser that builds an AST from a token list.
 *
 * The cursor (`index`) is instance state so each grammar level is a small,
 * independently testable method.
 */
class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly input: string,
  ) {}

  private fail(position: SourcePosition, message: string): Result<AstNode, TuffError> {
    return {
      ok: false,
      error: {
        kind: "unexpected_token",
        input: this.input,
        position,
        message,
      },
    };
  }

  // The position of the token at `i`, or the end of input if there is none.
  private posAt(i: number): SourcePosition {
    return this.tokens[i]?.pos ?? { line: 1, column: this.input.length + 1 };
  }

  // A primary is a number or a parenthesized expression.
  private parsePrimary(): Result<AstNode, TuffError> {
    const token = this.tokens[this.index];

    if (token?.kind === "number") {
      this.index += 1;
      return { ok: true, value: { kind: "number", value: token.value } };
    }

    // Parentheses and braces are interchangeable grouping delimiters.
    if (token?.kind === "lparen" || token?.kind === "lbrace") {
      const expectedCloser = token.kind === "lparen" ? "rparen" : "rbrace";
      this.index += 1;
      const inner = this.parseExpression();
      if (!inner.ok) {
        return inner;
      }

      if (this.tokens[this.index]?.kind !== expectedCloser) {
        const delimiter = token.kind === "lparen" ? "parenthesis" : "brace";
        return {
          ok: false,
          error: {
            kind: "unclosed_delimiter",
            input: this.input,
            position: this.posAt(this.index),
            delimiter,
            message: `Expected a closing ${delimiter}`,
          },
        };
      }

      this.index += 1;
      return inner;
    }

    if (token?.kind === "identifier") {
      this.index += 1;
      return { ok: true, value: { kind: "variable", name: token.value, pos: token.pos } };
    }

    if (token?.kind === "let") {
      return this.parseLet();
    }

    return this.fail(
      this.posAt(this.index),
      "Expected a number, identifier, or parenthesized expression",
    );
  }

  // A `let` binding: `let name = initializer; body`.
  private parseLet(): Result<AstNode, TuffError> {
    this.index += 1; // consume `let`

    const name = this.tokens[this.index];
    if (name?.kind !== "identifier") {
      return this.fail(this.posAt(this.index), "Expected a variable name after `let`");
    }
    this.index += 1;

    if (this.tokens[this.index]?.kind !== "equals") {
      return this.fail(this.posAt(this.index), "Expected `=` after the variable name");
    }
    this.index += 1;

    const initializer = this.parseExpression();
    if (!initializer.ok) {
      return initializer;
    }

    if (this.tokens[this.index]?.kind !== "semicolon") {
      return this.fail(this.posAt(this.index), "Expected `;` after the initializer");
    }
    this.index += 1;

    // The body after the `;` is optional; a bare binding evaluates to 0.
    if (this.index >= this.tokens.length) {
      return {
        ok: true,
        value: { kind: "let", name: name.value, initializer: initializer.value },
      };
    }

    const body = this.parseExpression();
    if (!body.ok) {
      return body;
    }

    return {
      ok: true,
      value: { kind: "let", name: name.value, initializer: initializer.value, body: body.value },
    };
  }

  // A term is a primary with `*` applied (higher precedence than `+`/`-`).
  private parseTerm(): Result<AstNode, TuffError> {
    const left = this.parsePrimary();
    if (!left.ok) {
      return left;
    }

    let node: AstNode = left.value;

    while (this.tokens[this.index]?.kind === "times") {
      this.index += 1;
      const right = this.parsePrimary();
      if (!right.ok) {
        return right;
      }
      node = { kind: "binary", op: "times", left: node, right: right.value };
    }

    return { ok: true, value: node };
  }

  // An expression is a term with `+`/`-` applied (lower precedence).
  private parseExpression(): Result<AstNode, TuffError> {
    const left = this.parseTerm();
    if (!left.ok) {
      return left;
    }

    let node: AstNode = left.value;

    let op = this.tokens[this.index]?.kind;
    while (op === "plus" || op === "minus") {
      this.index += 1;
      const right = this.parseTerm();
      if (!right.ok) {
        return right;
      }
      node = { kind: "binary", op, left: node, right: right.value };
      op = this.tokens[this.index]?.kind;
    }

    return { ok: true, value: node };
  }

  parse(): Result<AstNode, TuffError> {
    const result = this.parseExpression();
    if (!result.ok) {
      return result;
    }

    if (this.index < this.tokens.length) {
      return this.fail(this.posAt(this.index), "Unexpected trailing tokens");
    }

    return result;
  }
}

/**
 * Parses a token list into an AST.
 *
 * @param tokens - The tokens produced by the lexer.
 * @param input - The raw input, carried into errors for diagnostics.
 * @returns A Result holding the AST, or a structured error.
 */
export function parse(tokens: Token[], input: string): Result<AstNode, TuffError> {
  return new Parser(tokens, input).parse();
}
