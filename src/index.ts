/**
 * A structured error describing why evaluation failed.
 */
export type EvaluateError =
  | { kind: "invalid-number"; input: string; reason: string }
  | { kind: "malformed-expression"; input: string; reason: string }
  | { kind: "unknown-variable"; input: string; name: string; reason: string };

/**
 * The result of evaluating a Tuff expression.
 */
export type EvaluateResult = { ok: true; value: number } | { ok: false; error: EvaluateError };

/**
 * Evaluates a Tuff expression.
 *
 * Supports addition, subtraction, and multiplication, as well as
 * parentheses or curly braces for grouping. Curly braces may also open a
 * block of `let` statements followed by a final expression, e.g.
 * `{ let x = 2 + 3; x }`; variables are only visible inside the block
 * that declares them. Multiplication binds tighter than addition and
 * subtraction, which are evaluated left to right. Empty input is a defined
 * case and evaluates to 0.
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
  if (parser.unknownVariable !== null) {
    return {
      ok: false,
      error: {
        kind: "unknown-variable",
        input,
        name: parser.unknownVariable,
        reason: `Unknown variable "${parser.unknownVariable}" in "${input}"`,
      },
    };
  }
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

type Token = number | "+" | "-" | "*" | "(" | ")" | "{" | "}" | "let" | "=" | ";" | string;

/**
 * All non-identifier string tokens. Identifiers are any other string.
 */
const NON_IDENTIFIERS: ReadonlySet<string> = new Set([
  "let",
  "=",
  ";",
  "+",
  "-",
  "*",
  "(",
  ")",
  "{",
  "}",
]);

function isIdentifier(token: Token): token is string {
  return typeof token === "string" && !NON_IDENTIFIERS.has(token);
}

/**
 * Splits an expression into tokens, or returns null when the input
 * contains a non-numeric operand. Whitespace between tokens is allowed.
 */
function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  const pattern = /(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([(){}=;])|([*+-])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    if (match.index > lastIndex && input.slice(lastIndex, match.index).trim() !== "") {
      return null;
    }
    if (match[1] !== undefined) {
      tokens.push(Number(match[1]));
    } else if (match[2] !== undefined) {
      tokens.push(match[2] === "let" ? "let" : match[2]);
    } else if (match[3] !== undefined) {
      tokens.push(match[3] as "(" | ")" | "{" | "}" | "=" | ";");
    } else {
      tokens.push(match[4] as "+" | "-" | "*");
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
 *   expression   = term (('+' | '-') term)*
 *   term         = factor ('*' factor)*
 *   factor       = number | identifier | '(' expression ')' | block
 *   block        = '{' letStatement* expression '}'
 *   letStatement = 'let' identifier '=' expression ';'
 */
class Parser {
  private pos = 0;
  private scopes: Map<string, number>[] = [];
  unknownVariable: string | null = null;

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
      if (token === "{") {
        this.scopes.push(new Map());
        while (this.peek() === "let") {
          if (!this.parseLetStatement()) {
            this.scopes.pop();
            return null;
          }
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
    if (isIdentifier(token)) {
      this.advance();
      const value = this.lookup(token);
      if (value === null) {
        this.unknownVariable = token;
        return null;
      }
      return value;
    }
    return null;
  }

  /**
   * Parses `let identifier = expression ;`. The current block's scope must
   * already be pushed. Returns false when the statement is malformed.
   */
  private parseLetStatement(): boolean {
    this.advance(); // "let"
    const name = this.peek();
    if (name === undefined || !isIdentifier(name)) {
      return false;
    }
    this.advance();
    if (this.peek() !== "=") {
      return false;
    }
    this.advance();
    const value = this.parseExpression();
    if (value === null) {
      return false;
    }
    if (this.peek() !== ";") {
      return false;
    }
    this.advance();
    this.scopes[this.scopes.length - 1].set(name, value);
    return true;
  }

  private lookup(name: string): number | null {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const value = this.scopes[i].get(name);
      if (value !== undefined) {
        return value;
      }
    }
    return null;
  }
}
