type Token =
  | { type: "number"; value: number }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === " " || ch === "\t") {
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
    } else if ("+-*/".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < input.length && /[0-9.]/.test(input[i]!)) {
        num += input[i]!;
        i++;
      }
      tokens.push({ type: "number", value: Number(num) });
    } else {
      throw new Error(`Unexpected character: ${ch}`);
    }
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new Error("Unexpected end of expression");
    this.pos++;
    return t;
  }

  parse(): number {
    const result = this.expression();
    if (this.pos < this.tokens.length)
      throw new Error("Unexpected token after expression");
    return result;
  }

  private expression(): number {
    let left = this.term();
    while (
      this.peek()?.type === "op" &&
      ["+", "-"].includes((this.peek() as any).value)
    ) {
      const op = (this.next() as any).value;
      const right = this.term();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  private term(): number {
    let left = this.factor();
    while (
      this.peek()?.type === "op" &&
      ["*", "/"].includes((this.peek() as any).value)
    ) {
      const op = (this.next() as any).value;
      const right = this.factor();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  private factor(): number {
    const t = this.peek();
    if (t?.type === "op" && (t as any).value === "+") {
      this.next();
      return this.factor();
    }
    if (t?.type === "op" && (t as any).value === "-") {
      this.next();
      return -this.factor();
    }
    return this.primary();
  }

  private primary(): number {
    const t = this.peek();
    if (!t) throw new Error("Unexpected end of expression");
    if (t.type === "number") {
      this.next();
      return (t as any).value;
    }
    if (t.type === "lparen") {
      this.next();
      const result = this.expression();
      if (this.peek()?.type !== "rparen")
        throw new Error("Expected closing parenthesis");
      this.next();
      return result;
    }
    throw new Error(`Unexpected token: ${JSON.stringify(t)}`);
  }
}

export function interpret(input: string): number {
  if (input.trim() === "") return 0;
  const tokens = tokenize(input);
  if (tokens.length === 0) return 0;
  return new Parser(tokens).parse();
}
