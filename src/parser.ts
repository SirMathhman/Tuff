import { type ParseError, type ParseResult } from "./errors.js";
import { isIdentifier, type Token } from "./tokenize.js";

/**
 * A value binding: a number and whether it may be assigned.
 */
type ValueBinding = { kind: "value"; value: number; mutable: boolean };

/**
 * A variable binding. A `value` binding holds a number; a `ref` binding
 * points directly at a value binding object (so it tracks reassignment and
 * is unaffected by shadowing), with `mutable` indicating whether writes
 * through it are allowed.
 */
type Binding = ValueBinding | { kind: "ref"; target: ValueBinding; mutable: boolean };

/**
 * Recursive-descent parser over a token stream.
 *
 * Grammar:
 *   program      = statement* expression
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
  private error: ParseError | null = null;

  constructor(private readonly tokens: Token[]) {}

  private atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private advance(): Token | undefined {
    return this.tokens[this.pos++];
  }

  /**
   * Parses the top-level program: zero or more `let` statements followed
   * by a final expression, in a fresh top-level scope.
   */
  parseProgram(): ParseResult {
    this.scopes.push(new Map());
    const value = this.parseStatements() ? this.parseExpression() : null;
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
      return this.parseDereference();
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
   * Parses a dereference expression `*identifier`. The target must be a
   * reference binding; otherwise an invalid-dereference error is recorded.
   * Returns the current value of the referenced variable.
   */
  private parseDereference(): number | null {
    this.advance(); // "*"
    const name = this.peek();
    if (name === undefined || !isIdentifier(name)) {
      return null;
    }
    this.advance();
    const binding = this.lookup(name);
    if (binding === null) {
      this.error = { kind: "unknown-variable", name };
      return null;
    }
    if (binding.kind !== "ref") {
      this.error = { kind: "invalid-dereference", name };
      return null;
    }
    return binding.target.value;
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
      const ref = this.parseReferenceBinding();
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
    const value = this.parseExpression();
    if (value === null) {
      return false;
    }
    if (this.peek() !== ";") {
      return false;
    }
    this.advance();
    this.scopes[this.scopes.length - 1].set(name, { kind: "value", value, mutable });
    return true;
  }

  /**
   * Parses a reference initializer `&identifier` or `&mut identifier`.
   * The target must be a known value binding; `&mut` additionally requires
   * the target to be a `mut` binding. Returns a reference binding that
   * points directly at the target binding object.
   */
  private parseReferenceBinding(): Binding | null {
    this.advance(); // "&"
    let mutable = false;
    if (this.peek() === "mut") {
      this.advance();
      mutable = true;
    }
    const name = this.peek();
    if (name === undefined || !isIdentifier(name)) {
      return null;
    }
    this.advance();
    const binding = this.lookup(name);
    if (binding === null) {
      this.error = { kind: "unknown-variable", name };
      return null;
    }
    if (binding.kind === "ref") {
      return null;
    }
    if (mutable && !binding.mutable) {
      this.error = { kind: "immutable-assignment", name };
      return null;
    }
    return { kind: "ref", target: binding, mutable };
  }

  /**
   * Parses `identifier = expression ;`. The variable must already be
   * declared as `mut` in an enclosing scope.
   */
  private parseAssignmentStatement(): boolean {
    const first = this.peek();
    if (first === "*") {
      return this.parseDereferenceAssignment();
    }
    const name = this.advance() as string;
    this.advance(); // "="
    const value = this.parseExpression();
    if (value === null) {
      return false;
    }
    if (this.peek() !== ";") {
      return false;
    }
    this.advance();
    const binding = this.lookup(name);
    if (binding === null) {
      this.error = { kind: "unknown-variable", name };
      return false;
    }
    if (binding.kind === "ref") {
      return false;
    }
    if (!binding.mutable) {
      this.error = { kind: "immutable-assignment", name };
      return false;
    }
    binding.value = value;
    return true;
  }

  /**
   * Parses `*identifier = expression ;`. The target must be a mutable
   * reference binding; the write is applied to the referenced variable.
   */
  private parseDereferenceAssignment(): boolean {
    this.advance(); // "*"
    const name = this.advance() as string; // identifier (guaranteed by isAssignmentStart)
    this.advance(); // "=" (guaranteed by isAssignmentStart)
    const value = this.parseExpression();
    if (value === null) {
      return false;
    }
    if (this.peek() !== ";") {
      return false;
    }
    this.advance();
    const binding = this.lookup(name);
    if (binding === null) {
      this.error = { kind: "unknown-variable", name };
      return false;
    }
    if (binding.kind !== "ref") {
      this.error = { kind: "invalid-dereference", name };
      return false;
    }
    if (!binding.mutable) {
      this.error = { kind: "immutable-assignment", name };
      return false;
    }
    binding.target.value = value;
    return true;
  }

  private lookup(name: string): Binding | null {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const binding = this.scopes[i].get(name);
      if (binding !== undefined) {
        return binding;
      }
    }
    return null;
  }
}
