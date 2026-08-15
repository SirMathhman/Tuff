type Token =
  | { type: "number"; value: number }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "keyword"; value: string }
  | { type: "ident"; value: string }
  | { type: "assign" }
  | { type: "semicolon" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === " " || ch === "\t") {
      i++;
    } else if (ch === "(" || ch === "{") {
      tokens.push({ type: "lparen" });
      i++;
    } else if (ch === ")" || ch === "}") {
      tokens.push({ type: "rparen" });
      i++;
    } else if ("+-*/".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
    } else if (ch === "=") {
      tokens.push({ type: "assign" });
      i++;
    } else if (ch === ";") {
      tokens.push({ type: "semicolon" });
      i++;
    } else if (
      ch === "l" &&
      input.startsWith("let", i) &&
      (i + 3 >= input.length || !/[a-zA-Z0-9_]/.test(input[i + 3]!))
    ) {
      tokens.push({ type: "keyword", value: "let" });
      i += 3;
    } else if (/[a-zA-Z_]/.test(ch)) {
      let name = "";
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i]!)) {
        name += input[i]!;
        i++;
      }
      tokens.push({ type: "ident", value: name });
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
  constructor(
    private tokens: Token[],
    private scope: Map<string, number> = new Map(),
  ) {}

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
    this.letStatements();
    const result = this.expression();
    if (this.pos < this.tokens.length)
      throw new Error("Unexpected token after expression");
    return result;
  }

  private letStatements(): void {
    while (
      this.peek()?.type === "keyword" &&
      (this.peek() as { value: string }).value === "let"
    ) {
      this.next();
      const nameTok = this.next();
      if (nameTok.type !== "ident")
        throw new Error("Expected variable name after let");
      const assignTok = this.next();
      if (assignTok.type !== "assign")
        throw new Error("Expected = after variable name");
      const value = this.expression();
      const semiTok = this.next();
      if (semiTok.type !== "semicolon")
        throw new Error("Expected ; after let statement");
      this.scope.set(nameTok.value, value);
    }
  }

  private expression(): number {
    let left = this.term();
    while (true) {
      const t = this.peek();
      if (t?.type !== "op" || !["+", "-"].includes(t.value)) break;
      this.next();
      const right = this.term();
      left = t.value === "+" ? left + right : left - right;
    }
    return left;
  }

  private term(): number {
    let left = this.factor();
    while (true) {
      const t = this.peek();
      if (t?.type !== "op" || !["*", "/"].includes(t.value)) break;
      this.next();
      const right = this.factor();
      left = t.value === "*" ? left * right : left / right;
    }
    return left;
  }

  private factor(): number {
    const t = this.peek();
    if (t?.type === "op" && t.value === "+") {
      this.next();
      return this.factor();
    }
    if (t?.type === "op" && t.value === "-") {
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
      return t.value;
    }
    if (t.type === "ident") {
      this.next();
      const value = this.scope.get(t.value);
      if (value === undefined) throw new Error(`Unknown variable: ${t.value}`);
      return value;
    }
    if (t.type === "lparen") {
      this.next();
      const prevScope = this.scope;
      this.scope = new Map(prevScope);
      this.letStatements();
      const result = this.expression();
      if (this.peek()?.type !== "rparen")
        throw new Error("Expected closing delimiter");
      this.next();
      this.scope = prevScope;
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
