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
    return this.parseNumber();
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
