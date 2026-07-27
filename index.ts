type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "paren"; value: "(" | ")" };

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
    } else if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch as "(" | ")" });
      i++;
    } else {
      i++;
    }
  }
  return tokens;
}

class Parser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++]!;
  }

  parse(): number {
    if (this.tokens.length === 0) return 0;
    const result = this.parseExpression();
    return result;
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
