type Token =
  | { type: "num"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "lbrace" }
  | { type: "rbrace" }
  | { type: "semicolon" }
  | { type: "let" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/\d/.test(ch)) {
      let j = i;
      while (j < input.length && /\d/.test(input[j])) j++;
      tokens.push({ type: "num", value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j++;
      const word = input.slice(i, j);
      tokens.push(
        word === "let" ? { type: "let" } : { type: "ident", value: word },
      );
      i = j;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (ch === "{") {
      tokens.push({ type: "lbrace" });
      i++;
      continue;
    }
    if (ch === "}") {
      tokens.push({ type: "rbrace" });
      i++;
      continue;
    }
    if (ch === ";") {
      tokens.push({ type: "semicolon" });
      i++;
      continue;
    }
    if (ch === "=") {
      tokens.push({ type: "op", value: "=" });
      i++;
      continue;
    }
    throw new Error(`Unexpected character: ${ch}`);
  }
  return tokens;
}

class Parser {
  private pos = 0;

  constructor(
    private tokens: Token[],
    private env: Map<string, number>,
  ) {}

  parseProgram(): number {
    let value = 0;
    while (this.pos < this.tokens.length) {
      value = this.parseStatement();
      if (this.peek()?.type === "semicolon") this.next();
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  private parseStatement(): number {
    const tok = this.peek();
    if (tok?.type === "let") {
      this.next();
      const mutTok = this.peek();
      if (mutTok?.type === "ident" && mutTok.value === "mut") this.next();
      const nameTok = this.next();
      if (nameTok?.type !== "ident")
        throw new Error("Expected identifier after let");
      const eq = this.next();
      if (eq?.type !== "op" || eq.value !== "=")
        throw new Error("Expected = after let identifier");
      const rhs = this.parseExpression();
      this.env.set(nameTok.value, rhs);
      return 0;
    }
    if (tok?.type === "ident") {
      const saved = this.pos;
      this.next();
      const eq = this.peek();
      if (eq?.type === "op" && eq.value === "=") {
        this.next();
        const rhs = this.parseExpression();
        this.env.set(tok.value, rhs);
        return 0;
      }
      this.pos = saved;
    }
    return this.parseExpression();
  }

  private parseExpression(): number {
    return this.parseAdditive();
  }

  private parseAdditive(): number {
    let left = this.parseMultiplicative();
    for (;;) {
      const tok = this.peek();
      if (tok?.type === "op" && (tok.value === "+" || tok.value === "-")) {
        this.next();
        const right = this.parseMultiplicative();
        left = tok.value === "+" ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  private parseMultiplicative(): number {
    let left = this.parsePrimary();
    for (;;) {
      const tok = this.peek();
      if (tok?.type === "op" && (tok.value === "*" || tok.value === "/")) {
        this.next();
        const right = this.parsePrimary();
        left = tok.value === "*" ? left * right : left / right;
      } else {
        break;
      }
    }
    return left;
  }

  private parsePrimary(): number {
    const tok = this.next();
    if (tok?.type === "num") return tok.value;
    if (tok?.type === "ident") {
      const value = this.env.get(tok.value);
      if (value === undefined)
        throw new Error(`Undefined variable: ${tok.value}`);
      return value;
    }
    if (tok?.type === "lparen") {
      const value = this.parseExpression();
      if (this.next()?.type !== "rparen") throw new Error("Expected )");
      return value;
    }
    if (tok?.type === "lbrace") {
      return this.parseBlockBody();
    }
    throw new Error("Unexpected token in expression");
  }

  private parseBlockBody(): number {
    let value = 0;
    while (this.peek()?.type !== "rbrace") {
      value = this.parseStatement();
      if (this.peek()?.type === "semicolon") this.next();
    }
    if (this.next()?.type !== "rbrace") throw new Error("Expected }");
    return value;
  }
}

export function evaluate(input: string): number {
  const tokens = tokenize(input);
  if (tokens.length === 0) return 0;
  const parser = new Parser(tokens, new Map());
  return parser.parseProgram();
}
