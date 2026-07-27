function tokenize(source: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === " " || ch === "\t") {
      i++;
    } else if (/[0-9]/.test(ch)) {
      let num = "";
      while (i < source.length && /[0-9.]/.test(source[i]!)) {
        num += source[i++];
      }
      tokens.push(num);
    } else if (/[a-zA-Z_]/.test(ch)) {
      let word = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) {
        word += source[i++];
      }
      tokens.push(word);
    } else {
      tokens.push(ch);
      i++;
    }
  }
  return tokens;
}

class Parser {
  private pos = 0;
  private scope: Map<string, number> = new Map();

  constructor(private tokens: string[]) {}

  peek(): string | undefined {
    return this.tokens[this.pos];
  }

  consume(): string {
    return this.tokens[this.pos++]!;
  }

  parse(): number {
    const result = this.parseExpression();
    return result;
  }

  private parseExpression(): number {
    let result = this.parseTerm();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.consume();
      const val = this.parseTerm();
      result = op === "+" ? result + val : result - val;
    }
    return result;
  }

  private parseTerm(): number {
    let result = this.parseFactor();
    while (this.peek() === "*" || this.peek() === "/") {
      const op = this.consume();
      const val = this.parseFactor();
      result = op === "*" ? result * val : result / val;
    }
    return result;
  }

  private parseFactor(): number {
    const token = this.peek();
    if (token === "(") {
      this.consume();
      const result = this.parseExpression();
      this.consume(); // ")"
      return result;
    }
    if (token === "{") {
      return this.parseBlock();
    }
    if (token === "let") {
      return this.parseLetExpression();
    }
    const val = this.consume();
    if (this.scope.has(val)) {
      return this.scope.get(val)!;
    }
    return Number(val);
  }

  private parseBlock(): number {
    this.consume(); // "{"
    const childScope = new Map(this.scope);
    let lastVal = 0;
    while (this.peek() !== "}" && this.peek() !== undefined) {
      if (this.peek() === "let") {
        this.consume(); // "let"
        const name = this.consume();
        this.consume(); // "="
        const val = this.parseAssignment(childScope);
        childScope.set(name, val);
        if (this.peek() === ";") this.consume();
      } else {
        lastVal = this.parseAssignment(childScope);
        if (this.peek() === ";") this.consume();
      }
    }
    this.consume(); // "}"
    return lastVal;
  }

  private parseAssignment(scope: Map<string, number>): number {
    const oldScope = this.scope;
    this.scope = scope;
    const result = this.parseExpression();
    this.scope = oldScope;
    return result;
  }

  private parseLetExpression(): number {
    this.consume(); // "let"
    const name = this.consume();
    this.consume(); // "="
    const val = this.parseExpression();
    this.scope.set(name, val);
    if (this.peek() === ";") this.consume();
    return val;
  }
}

export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return 0;

  const parser = new Parser(tokens);
  return parser.parse();
}
