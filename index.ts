type Token =
  | { type: "num"; value: number }
  | { type: "op"; value: "+" | "-" | "*" | "/" };

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
  | { kind: "neg"; operand: Expr };

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
    throw new Error("interpret: expected a number");
  }
}

function evaluate(node: Expr): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "neg":
      return -evaluate(node.operand);
    case "bin": {
      const left = evaluate(node.left);
      const right = evaluate(node.right);
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
  const trimmed = input.trim();
  if (trimmed === "") {
    return 0;
  }
  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return 0;
  }
  const ast = new Parser(tokens).parse();
  return evaluate(ast);
}
