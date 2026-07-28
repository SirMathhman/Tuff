type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "paren"; value: "(" | ")" | "{" | "}" }
  | { type: "keyword"; value: string }
  | { type: "identifier"; value: string }
  | { type: "punctuator"; value: "=" | ";" };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
    } else if ((ch >= "0" && ch <= "9") || ch === ".") {
      let start = i;
      if (ch === ".") {
        i++;
      } else {
        while (
          i < source.length &&
          ((source[i]! >= "0" && source[i]! <= "9") || source[i] === ".")
        ) {
          i++;
        }
      }
      tokens.push({ type: "number", value: Number(source.slice(start, i)) });
    } else if (ch && "+-*/".includes(ch)) {
      tokens.push({ type: "operator", value: ch as "+" | "-" | "*" | "/" });
      i++;
    } else if (ch === "(" || ch === ")" || ch === "{" || ch === "}") {
      tokens.push({ type: "paren", value: ch as "(" | ")" | "{" | "}" });
      i++;
    } else if (ch === "=") {
      tokens.push({ type: "punctuator", value: "=" });
      i++;
    } else if (ch === ";") {
      tokens.push({ type: "punctuator", value: ";" });
      i++;
    } else if (
      (ch >= "a" && ch <= "z") ||
      (ch >= "A" && ch <= "Z") ||
      ch === "_"
    ) {
      let start = i;
      while (
        i < source.length &&
        ((source[i]! >= "a" && source[i]! <= "z") ||
          (source[i]! >= "A" && source[i]! <= "Z") ||
          (source[i]! >= "0" && source[i]! <= "9") ||
          source[i] === "_")
      ) {
        i++;
      }
      const word = source.slice(start, i);
      if (word === "let") {
        tokens.push({ type: "keyword", value: "let" });
      } else {
        tokens.push({ type: "identifier", value: word });
      }
    } else {
      i++;
    }
  }
  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos: number;
  private scope: Map<string, number>;

  constructor(tokens: Token[], scope?: Map<string, number>) {
    this.tokens = tokens;
    this.pos = 0;
    this.scope = scope || new Map();
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++]!;
  }

  parse(): number {
    if (this.tokens.length === 0) return 0;
    return this.parseStatements(this.scope, () => false);
  }

  private parseStatements(
    scope: Map<string, number>,
    shouldStop: () => boolean
  ): number {
    let lastResult = 0;
    while (this.pos < this.tokens.length && !shouldStop()) {
      const t = this.peek();
      if (t && t.type === "keyword" && t.value === "let") {
        lastResult = this.parseLetStatement(scope);
      } else {
        lastResult = this.parseExpression();
        if (this.peek()?.type === "punctuator" && this.peek()?.value === ";") {
          this.consume();
        }
      }
    }
    return lastResult;
  }

  private parseLetStatement(scope: Map<string, number>): number {
    this.consume(); // consume "let"
    const idToken = this.peek();
    if (idToken && idToken.type === "identifier") {
      this.consume(); // consume identifier
      if (this.peek()?.type === "punctuator" && this.peek()?.value === "=") {
        this.consume(); // consume "="
        const value = this.parseExpression();
        scope.set(idToken.value, value);
      }
      if (this.peek()?.type === "punctuator" && this.peek()?.value === ";") {
        this.consume(); // consume ";"
      }
      return scope.get(idToken.value) ?? 0;
    }
    return 0;
  }

  private parseExpression(): number {
    let left = this.parseTerm();
    while (this.pos < this.tokens.length) {
      const token = this.peek();
      if (
        token &&
        token.type === "operator" &&
        (token.value === "+" || token.value === "-")
      ) {
        this.consume();
        const right = this.parseTerm();
        left = token.value === "+" ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  private parseTerm(): number {
    let left = this.parseFactor();
    while (this.pos < this.tokens.length) {
      const token = this.peek();
      if (
        token &&
        token.type === "operator" &&
        (token.value === "*" || token.value === "/")
      ) {
        this.consume();
        const right = this.parseFactor();
        left = token.value === "*" ? left * right : left / right;
      } else {
        break;
      }
    }
    return left;
  }

  private parseFactor(): number {
    const token = this.peek();
    if (!token) {
      return 0;
    }
    if (token.type === "number") {
      this.consume();
      return token.value;
    }
    if (token.type === "identifier") {
      this.consume();
      return this.scope.get(token.value) ?? 0;
    }
    if (token.type === "paren" && token.value === "(") {
      this.consume();
      const result = this.parseExpression();
      if (
        this.pos < this.tokens.length &&
        this.peek()?.type === "paren" &&
        this.peek()?.value === ")"
      ) {
        this.consume();
      }
      return result;
    }
    if (token.type === "paren" && token.value === "{") {
      this.consume();
      const childScope = new Map(this.scope);
      const prevScope = this.scope;
      this.scope = childScope;
      const result = this.parseStatements(childScope, () => {
        const t = this.peek();
        return t?.type === "paren" && t.value === "}";
      });
      if (
        this.pos < this.tokens.length &&
        this.peek()?.type === "paren" &&
        this.peek()?.value === "}"
      ) {
        this.consume();
      }
      this.scope = prevScope;
      return result;
    }
    if (
      token.type === "operator" &&
      (token.value === "+" || token.value === "-")
    ) {
      this.consume();
      const right = this.parseFactor();
      return token.value === "+" ? right : -right;
    }
    this.consume();
    return 0;
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
