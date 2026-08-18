import { type ParseError, type ParseResult } from "./errors.js";
import { isIdentifier, type Token } from "./tokenize.js";
import {
  parseDereference,
  parseDereferenceAssignment,
  parseReferenceBinding,
} from "./reference.js";

/**
 * A value binding: a number, whether it may be assigned, and the kind of
 * value it was initialized with (a boolean literal or a number).
 */
type ValueBinding = {
  kind: "value";
  value: number;
  mutable: boolean;
  literal: "number" | "boolean";
};

/**
 * A variable binding. A `value` binding holds a number; a `ref` binding
 * points directly at a value binding object (so it tracks reassignment and
 * is unaffected by shadowing), with `mutable` indicating whether writes
 * through it are allowed.
 */
export type Binding =
  | ValueBinding
  | {
      kind: "ref";
      target: ValueBinding;
      mutable: boolean;
    };

/**
 * Recursive-descent parser over a token stream.
 *
 * Grammar:
 *   program      = statement* expression?
 *   statement    = letStatement | assignmentStatement
 *   expression   = term (('+' | '-') term)*
 *   term         = factor ('*' factor)*
 *   factor       = number | boolean | identifier | '(' expression ')'
 *                 | block | '*' dereference
 *   boolean      = 'true' | 'false'
 *   dereference  = identifier
 *   block        = '{' statement* expression '}'
 *   letStatement = 'let' 'mut'? identifier '=' (expression | reference) ';'
 *   reference    = '&' 'mut'? identifier
 *   assignmentStatement = identifier '=' expression ';'
 *                      | '*' identifier '=' expression ';'
 */
export class Parser {
  private pos = 0;
  private scopes: Map<string, Binding>[] = [];
  error: ParseError | null = null;

  constructor(private readonly tokens: Token[]) {}

  private atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  advance(): Token | undefined {
    return this.tokens[this.pos++];
  }

  /**
   * Returns the literal kind of the token at the current position when it is
   * a boolean or number literal, otherwise null.
   */
  private literalKind(): "boolean" | "number" | null {
    const token = this.peek();
    if (token === "true" || token === "false") {
      return "boolean";
    }
    return typeof token === "number" ? "number" : null;
  }

  /**
   * Records a type-mismatch error when the assigned literal's kind differs
   * from the binding's initialized kind. A non-literal right-hand side
   * (an expression or identifier) never mismatches.
   */
  checkTypeMismatch(
    name: string,
    binding: ValueBinding,
    literal: "boolean" | "number" | null,
  ): boolean {
    if (literal === null || literal === binding.literal) {
      return true;
    }
    this.error = { kind: "type-mismatch", name, from: literal, to: binding.literal };
    return false;
  }

  /**
   * Parses the top-level program: zero or more `let` statements followed
   * by an optional final expression, in a fresh top-level scope. A program
   * with no final expression evaluates to 0.
   */
  parseProgram(): ParseResult {
    this.scopes.push(new Map());
    let value: number | null;
    if (!this.parseStatements()) {
      value = null;
    } else if (this.atEnd()) {
      value = 0;
    } else {
      value = this.parseExpression();
    }
    this.scopes.pop();
    if (this.error !== null) {
      return { ok: false, error: this.error };
    }
    if (value === null || !this.atEnd()) {
      return { ok: false, error: { kind: "malformed-expression" } };
    }
    return { ok: true, value };
  }

  /**
   * Parses zero or more statements (`let` declarations and assignments).
   * The current scope must already be pushed. Returns false when a
   * statement is malformed.
   */
  private parseStatements(): boolean {
    for (;;) {
      const token = this.peek();
      if (token === undefined) {
        return true;
      }
      if (token === "let") {
        if (!this.parseLetStatement()) {
          return false;
        }
      } else if (this.isAssignmentStart()) {
        if (!this.parseAssignmentStatement()) {
          return false;
        }
      } else {
        return true;
      }
    }
  }

  /**
   * Returns true when the token at the current position begins an
   * assignment statement: `identifier =` or `*identifier =`.
   */
  private isAssignmentStart(): boolean {
    const token = this.peek() as Token;
    if (token === "*") {
      const name = this.tokens[this.pos + 1];
      return isIdentifier(name) && this.tokens[this.pos + 2] === "=";
    }
    return isIdentifier(token) && this.tokens[this.pos + 1] === "=";
  }

  private parseExpression(): number | null {
    let value = this.parseTerm();
    if (value === null) {
      return null;
    }
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.advance() as "+" | "-";
      const next = this.parseTerm();
      if (next === null) {
        return null;
      }
      value = op === "+" ? value + next : value - next;
    }
    return value;
  }

  private parseTerm(): number | null {
    let value = this.parseFactor();
    if (value === null) {
      return null;
    }
    while (this.peek() === "*") {
      this.advance();
      const next = this.parseFactor();
      if (next === null) {
        return null;
      }
      value *= next;
    }
    return value;
  }

  private parseFactor(): number | null {
    const token = this.peek();
    if (token === undefined) {
      return null;
    }
    if (typeof token === "number" || token === "true" || token === "false") {
      this.advance();
      return typeof token === "number" ? token : token === "true" ? 1 : 0;
    }
    if (token === "(" || token === "{") {
      this.advance();
      if (token === "{") {
        this.scopes.push(new Map());
        if (!this.parseStatements()) {
          this.scopes.pop();
          return null;
        }
      }
      const value = this.parseExpression();
      const expected = token === "(" ? ")" : "}";
      const closed = value !== null && this.peek() === expected;
      if (token === "{") {
        this.scopes.pop();
      }
      if (!closed) {
        return null;
      }
      this.advance();
      return value;
    }
    if (token === "*") {
      return parseDereference(this);
    }
    if (isIdentifier(token)) {
      this.advance();
      const binding = this.lookup(token);
      if (binding === null) {
        this.error = { kind: "unknown-variable", name: token };
        return null;
      }
      if (binding.kind === "ref") {
        this.error = { kind: "reference-as-value", name: token };
        return null;
      }
      return binding.value;
    }
    return null;
  }

  /**
   * Parses `let identifier = expression ;`. The current block's scope must
   * already be pushed. Returns false when the statement is malformed.
   */
  private parseLetStatement(): boolean {
    this.advance(); // "let"
    let mutable = false;
    if (this.peek() === "mut") {
      this.advance();
      mutable = true;
    }
    const name = this.peek();
    if (name === undefined || !isIdentifier(name)) {
      return false;
    }
    this.advance();
    if (this.peek() !== "=") {
      return false;
    }
    this.advance();
    if (this.peek() === "&") {
      const ref = parseReferenceBinding(this);
      if (ref === null) {
        return false;
      }
      if (this.peek() !== ";") {
        return false;
      }
      this.advance();
      this.scopes[this.scopes.length - 1].set(name, ref);
      return true;
    }
    const literal = this.literalKind();
    const value = this.parseExpression();
    if (value === null) {
      return false;
    }
    if (this.peek() !== ";") {
      return false;
    }
    this.advance();
    this.scopes[this.scopes.length - 1].set(name, {
      kind: "value",
      value,
      mutable,
      literal: literal ?? "number",
    });
    return true;
  }

  /**
   * Parses `= expression ;` and returns the parsed value together with the
   * literal kind of the right-hand side. Returns null when the right-hand
   * side is malformed.
   */
  parseAssignmentRhs(): { literal: "boolean" | "number" | null; value: number } | null {
    this.advance(); // "="
    const literal = this.literalKind();
    const value = this.parseExpression();
    if (value === null) {
      return null;
    }
    if (this.peek() !== ";") {
      return null;
    }
    this.advance();
    return { literal, value };
  }

  /**
   * Looks up a binding by name, recording an unknown-variable error and
   * returning null when it is not found.
   */
  lookupOrError(name: string): Binding | null {
    const binding = this.lookup(name);
    if (binding === null) {
      this.error = { kind: "unknown-variable", name };
      return null;
    }
    return binding;
  }

  /**
   * Parses `identifier = expression ;`. The variable must already be
   * declared as `mut` in an enclosing scope.
   */
  private parseAssignmentStatement(): boolean {
    const first = this.peek();
    if (first === "*") {
      return parseDereferenceAssignment(this);
    }
    const name = this.advance() as string;
    const rhs = this.parseAssignmentRhs();
    if (rhs === null) {
      return false;
    }
    const binding = this.lookupOrError(name);
    if (binding === null) {
      return false;
    }
    if (binding.kind === "ref") {
      this.error = { kind: "reference-assignment", name };
      return false;
    }
    if (!this.checkTypeMismatch(name, binding, rhs.literal)) {
      return false;
    }
    if (!binding.mutable) {
      this.error = { kind: "immutable-assignment", name };
      return false;
    }
    binding.value = rhs.value;
    return true;
  }

  lookup(name: string): Binding | null {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const binding = this.scopes[i].get(name);
      if (binding !== undefined) {
        return binding;
      }
    }
    return null;
  }
}
