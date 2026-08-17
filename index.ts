/**
 * Interprets a string as a number.
 * Supports arithmetic expressions using +, -, *, / and parentheses.
 * Returns 0 for an empty string or any value that cannot be parsed.
 */
export function interpret(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") return 0;
  try {
    const value = new ExpressionParser(trimmed).parse();
    return Number.isNaN(value) ? 0 : value;
  } catch {
    return 0;
  }
}

/**
 * Recursive descent parser for arithmetic expressions.
 * Grammar:
 *   expression = term (('+' | '-') term)*
 *   term       = factor (('*' | '/') factor)*
 *   factor     = ['+' | '-'] (number | '(' expression ')')
 */
class ExpressionParser {
  private pos = 0;
  private scope = new Map<string, number>();

  constructor(private readonly text: string) {}

  private peek(): string | undefined {
    return this.text[this.pos];
  }

  private skipWhitespace(): void {
    while (this.pos < this.text.length && /\s/.test(this.text[this.pos]!)) {
      this.pos++;
    }
  }

  parse(): number {
    this.skipWhitespace();
    this.parseLetDeclarations();
    const value = this.parseExpression();
    this.skipWhitespace();
    if (this.pos < this.text.length) {
      throw new Error(`Unexpected character at position ${this.pos}`);
    }
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    for (;;) {
      this.skipWhitespace();
      const ch = this.peek();
      if (ch === "+") {
        this.pos++;
        value += this.parseTerm();
      } else if (ch === "-") {
        this.pos++;
        value -= this.parseTerm();
      } else {
        break;
      }
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    for (;;) {
      this.skipWhitespace();
      const ch = this.peek();
      if (ch === "*") {
        this.pos++;
        value *= this.parseFactor();
      } else if (ch === "/") {
        this.pos++;
        value /= this.parseFactor();
      } else {
        break;
      }
    }
    return value;
  }

  private parseFactor(): number {
    this.skipWhitespace();
    const ch = this.peek();
    if (ch === "+") {
      this.pos++;
      return this.parseFactor();
    }
    if (ch === "-") {
      this.pos++;
      return -this.parseFactor();
    }
    if (ch === "(") {
      this.pos++;
      const value = this.parseExpression();
      this.skipWhitespace();
      if (this.peek() !== ")") {
        throw new Error("Expected closing parenthesis");
      }
      this.pos++;
      return value;
    }
    if (ch === "{") {
      this.pos++;
      return this.parseBlock();
    }
    if (ch !== undefined && /[A-Za-z_]/.test(ch)) {
      const name = this.parseIdentifier();
      if (!this.scope.has(name)) {
        throw new Error(`Unknown variable '${name}'`);
      }
      return this.scope.get(name)!;
    }
    return this.parseNumber();
  }

  /** Parses a `{ let x = expr; ... expr }` block. The opening `{` is already consumed. */
  private parseBlock(): number {
    this.parseLetDeclarations();
    const value = this.parseExpression();
    this.skipWhitespace();
    if (this.peek() !== "}") {
      throw new Error("Expected '}'");
    }
    this.pos++;
    return value;
  }

  /** Parses zero or more `let name = expression;` declarations into the current scope. */
  private parseLetDeclarations(): void {
    for (;;) {
      this.skipWhitespace();
      if (!this.isKeyword("let")) {
        break;
      }
      this.pos += 3;
      this.skipWhitespace();
      const name = this.parseIdentifier();
      this.skipWhitespace();
      if (this.peek() !== "=") {
        throw new Error("Expected '=' after variable name");
      }
      this.pos++;
      const value = this.parseExpression();
      this.scope.set(name, value);
      this.skipWhitespace();
      if (this.peek() === ";") {
        this.pos++;
      }
    }
  }

  /** True if the keyword starts at the current position and is not part of a longer identifier. */
  private isKeyword(word: string): boolean {
    if (!this.text.startsWith(word, this.pos)) {
      return false;
    }
    const next = this.text[this.pos + word.length];
    return next === undefined || !/[A-Za-z0-9_]/.test(next);
  }

  private parseIdentifier(): string {
    this.skipWhitespace();
    const start = this.pos;
    while (
      this.pos < this.text.length &&
      /[A-Za-z0-9_]/.test(this.text[this.pos]!)
    ) {
      this.pos++;
    }
    if (start === this.pos) {
      throw new Error(`Expected identifier at position ${start}`);
    }
    return this.text.slice(start, this.pos);
  }

  private parseNumber(): number {
    this.skipWhitespace();
    const start = this.pos;
    while (this.pos < this.text.length && /\d/.test(this.text[this.pos]!)) {
      this.pos++;
    }
    let end = this.pos;
    if (this.text[end] === "." && /\d/.test(this.text[end + 1] ?? "")) {
      end++;
      while (end < this.text.length && /\d/.test(this.text[end]!)) {
        end++;
      }
    }
    this.pos = end;
    if (start === end) {
      throw new Error(`Expected number at position ${start}`);
    }
    return Number(this.text.slice(start, end));
  }
}

console.log("Hello via Bun!");
