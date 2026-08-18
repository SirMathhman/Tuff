/**
 * A structured error describing why evaluation failed.
 */
export type EvaluateError =
  | { kind: "invalid-number"; input: string; reason: string }
  | { kind: "malformed-expression"; input: string; reason: string };

/**
 * The result of evaluating a Tuff expression.
 */
export type EvaluateResult = { ok: true; value: number } | { ok: false; error: EvaluateError };

/**
 * Evaluates a Tuff expression.
 *
 * Supports addition, subtraction, and multiplication, as well as
 * parentheses or curly braces for grouping. Multiplication binds tighter
 * than addition and subtraction, which are evaluated left to right. Empty
 * input is a defined case and evaluates to 0.
 */
export function evaluate(input: string): EvaluateResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: true, value: 0 };
  }

  const tokens = tokenize(trimmed);
  if (tokens === null) {
    return {
      ok: false,
      error: {
        kind: "invalid-number",
        input,
        reason: `Cannot parse "${input}" as a number`,
      },
    };
  }

  const parser = new Parser(tokens);
  const value = parser.parseExpression();
  if (value === null || !parser.atEnd()) {
    return {
      ok: false,
      error: {
        kind: "malformed-expression",
        input,
        reason: `Unexpected end of expression in "${input}"`,
      },
    };
  }
  return { ok: true, value };
}

type Token = number | "+" | "-" | "*" | "(" | ")" | "{" | "}";

/**
 * Splits an expression into tokens, or returns null when the input
 * contains a non-numeric operand. Whitespace between tokens is allowed.
 */
function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  const pattern = /(\d+(?:\.\d+)?)|([(){}])|([*+-])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    if (match.index > lastIndex && input.slice(lastIndex, match.index).trim() !== "") {
      return null;
    }
    if (match[1] !== undefined) {
      tokens.push(Number(match[1]));
    } else if (match[2] !== undefined) {
      tokens.push(match[2] as "(" | ")" | "{" | "}");
    } else {
      tokens.push(match[3] as "+" | "-" | "*");
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < input.length) {
    return null;
  }
  return tokens;
}

/**
 * Recursive-descent parser over a token stream.
 *
 * Grammar:
 *   expression = term (('+' | '-') term)*
 *   term       = factor ('*' factor)*
 *   factor     = number | '(' expression ')'
 */
class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  atEnd(): boolean {
    return this.pos >= this.tokens.length;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private advance(): Token | undefined {
    return this.tokens[this.pos++];
  }

  parseExpression(): number | null {
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
    if (typeof token === "number") {
      this.advance();
      return token;
    }
    if (token === "(" || token === "{") {
      this.advance();
      const value = this.parseExpression();
      const expected = token === "(" ? ")" : "}";
      if (value === null || this.peek() !== expected) {
        return null;
      }
      this.advance();
      return value;
    }
    return null;
  }
}
