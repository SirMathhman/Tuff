type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: "+" | "-" | "*" | "/" }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "lbrace" }
  | { type: "rbrace" }
  | { type: "ident"; value: string }
  | { type: "let" }
  | { type: "assign" }
  | { type: "semi" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t") {
      i++;
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
    if (ch === "=") {
      tokens.push({ type: "assign" });
      i++;
      continue;
    }
    if (ch === ";") {
      tokens.push({ type: "semi" });
      i++;
      continue;
    }
    const identMatch = input.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (identMatch) {
      const name = identMatch[0];
      if (name === "let") {
        tokens.push({ type: "let" });
      } else {
        tokens.push({ type: "ident", value: name });
      }
      i += name.length;
      continue;
    }
    const numMatch = input.slice(i).match(/^\d+(\.\d+)?/);
    if (numMatch) {
      tokens.push({ type: "num", value: Number(numMatch[0]) });
      i += numMatch[0].length;
      continue;
    }
    throw new Error(`interpret: unexpected character "${ch}" in "${input}"`);
  }
  return tokens;
}

type Expr =
  | { kind: "num"; value: number }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; left: Expr; right: Expr }
  | { kind: "neg"; operand: Expr }
  | { kind: "paren"; operand: Expr }
  | { kind: "var"; name: string }
  | { kind: "let"; bindings: { name: string; value: Expr }[]; body: Expr };

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) {
      throw new Error("interpret: unexpected end of expression");
    }
    this.pos++;
    return t;
  }

  parse(): Expr {
    const expr = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new Error("interpret: unexpected trailing tokens");
    }
    return expr;
  }

  private parseExpression(): Expr {
    if (!this.peek()) {
      throw new Error("interpret: empty expression");
    }
    let left = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
        this.next();
        const right = this.parseTerm();
        left = { kind: "bin", op: t.value, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseTerm(): Expr {
    let left = this.parseFactor();
    for (;;) {
      const t = this.peek();
      if (t && t.type === "op" && (t.value === "*" || t.value === "/")) {
        this.next();
        const right = this.parseFactor();
        left = { kind: "bin", op: t.value, left, right };
      } else {
        break;
      }
    }
    return left;
  }

  private parseFactor(): Expr {
    const t = this.next();
    if (t.type === "num") {
      return { kind: "num", value: t.value };
    }
    if (t.type === "op" && t.value === "-") {
      return { kind: "neg", operand: this.parseFactor() };
    }
    if (t.type === "lparen") {
      const inner = this.parseExpression();
      const close = this.next();
      if (close.type !== "rparen") {
        throw new Error("interpret: expected closing parenthesis");
      }
      return { kind: "paren", operand: inner };
    }
    if (t.type === "lbrace") {
      const bindings: { name: string; value: Expr }[] = [];
      while (this.peek()?.type === "let") {
        this.next();
        const nameTok = this.next();
        if (nameTok.type !== "ident") {
          throw new Error("interpret: expected variable name after let");
        }
        const eq = this.next();
        if (eq.type !== "assign") {
          throw new Error("interpret: expected = after variable name");
        }
        const value = this.parseExpression();
        const semi = this.next();
        if (semi.type !== "semi") {
          throw new Error("interpret: expected ; after let binding");
        }
        bindings.push({ name: nameTok.value, value });
      }
      const body = this.parseExpression();
      const close = this.next();
      if (close.type !== "rbrace") {
        throw new Error("interpret: expected closing brace");
      }
      return { kind: "let", bindings, body };
    }
    if (t.type === "ident") {
      return { kind: "var", name: t.value };
    }
    throw new Error("interpret: expected a number");
  }
}

function evaluate(node: Expr, env: Map<string, number>): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "var": {
      if (!env.has(node.name)) {
        throw new Error(`interpret: undefined variable "${node.name}"`);
      }
      return env.get(node.name)!;
    }
    case "neg":
      return -evaluate(node.operand, env);
    case "paren":
      return evaluate(node.operand, env);
    case "let": {
      const scope = new Map(env);
      for (const binding of node.bindings) {
        scope.set(binding.name, evaluate(binding.value, scope));
      }
      return evaluate(node.body, scope);
    }
    case "bin": {
      const left = evaluate(node.left, env);
      const right = evaluate(node.right, env);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
      }
    }
  }
}

export function interpret(input: string): number {
  const tokens = tokenize(input.trim());
  const ast = new Parser(tokens).parse();
  return evaluate(ast, new Map());
}
