type Token =
  | { type: "num"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "lbrace" }
  | { type: "rbrace" }
  | { type: "semicolon" }
  | { type: "let" }
  | { type: "bool"; value: boolean };

const singleCharTokens: Record<string, Token["type"]> = {
  "(": "lparen",
  ")": "rparen",
  "{": "lbrace",
  "}": "rbrace",
  ";": "semicolon",
  "+": "op",
  "-": "op",
  "*": "op",
  "/": "op",
  "=": "op",
  "<": "op",
  ">": "op",
};

const multiCharTokens: Record<string, string> = {
  "||": "||",
  "==": "==",
  "<=": "<=",
  ">=": ">=",
  "!=": "!=",
  "+=": "+=",
};

function readToken(input: string, i: number): { token: Token; next: number } {
  const ch = input.charAt(i);
  if (/\d/.test(ch)) {
    let j = i;
    while (j < input.length && /\d/.test(input.charAt(j))) j++;
    return {
      token: { type: "num", value: Number(input.slice(i, j)) },
      next: j,
    };
  }
  if (/[a-zA-Z_]/.test(ch)) {
    let j = i;
    while (j < input.length && /[a-zA-Z0-9_]/.test(input.charAt(j))) j++;
    const word = input.slice(i, j);
    if (word === "let") return { token: { type: "let" }, next: j };
    if (word === "true" || word === "false")
      return {
        token: { type: "bool", value: word === "true" },
        next: j,
      };
    return { token: { type: "ident", value: word }, next: j };
  }
  const twoChar = input.slice(i, i + 2);
  if (multiCharTokens[twoChar]) {
    return { token: { type: "op", value: twoChar }, next: i + 2 };
  }
  const single = singleCharTokens[ch];
  if (single) {
    return {
      token:
        single === "op"
          ? { type: "op", value: ch }
          : ({ type: single } as Token),
      next: i + 1,
    };
  }
  throw new Error(`Unexpected character: ${ch}`);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const { token, next } = readToken(input, i);
    tokens.push(token);
    i = next;
  }
  return tokens;
}

type Value = { kind: "num"; value: number } | { kind: "bool"; value: boolean };

interface Binding {
  value: Value;
  mutable: boolean;
}

class Parser {
  private pos = 0;

  private scopes: Map<string, Binding>[] = [new Map()];

  constructor(private tokens: Token[]) {}

  private lookup(name: string): Binding | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i];
      if (!scope) continue;
      const binding = scope.get(name);
      if (binding) return binding;
    }
    return undefined;
  }

  private define(name: string, value: Value, mutable: boolean): void {
    const scope = this.scopes[this.scopes.length - 1];
    if (!scope) throw new Error("No active scope");
    scope.set(name, { value, mutable });
  }

  private pushScope(): void {
    this.scopes.push(new Map());
  }

  private popScope(): void {
    this.scopes.pop();
  }

  private num(v: Value): number {
    if (v.kind === "bool") return v.value ? 1 : 0;
    return v.value;
  }

  parseProgram(): number {
    let value: Value = { kind: "num", value: 0 };
    while (this.pos < this.tokens.length) {
      value = this.parseStatement(false).value;
      if (this.peek()?.type === "semicolon") this.next();
    }
    return this.num(value);
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  private parseStatement(needsValue: boolean): {
    value: Value;
    isStatement: boolean;
  } {
    const zero: Value = { kind: "num", value: 0 };
    const tok = this.peek();
    if (tok?.type === "let") {
      this.next();
      const mutTok = this.peek();
      const isMut = mutTok?.type === "ident" && mutTok.value === "mut";
      if (isMut) this.next();
      const nameTok = this.next();
      if (nameTok?.type !== "ident")
        throw new Error("Expected identifier after let");
      const eq = this.next();
      if (eq?.type !== "op" || eq.value !== "=")
        throw new Error("Expected = after let identifier");
      const rhs = this.parseExpression(true);
      this.define(nameTok.value, rhs, isMut);
      return { value: zero, isStatement: true };
    }
    if (tok?.type === "ident") {
      const saved = this.pos;
      this.next();
      const eq = this.peek();
      if (eq?.type === "op" && (eq.value === "=" || eq.value === "+=")) {
        this.next();
        const rhs = this.parseExpression(true);
        const binding = this.lookup(tok.value);
        if (!binding) throw new Error(`Undefined variable: ${tok.value}`);
        if (!binding.mutable)
          throw new Error(`Cannot assign to immutable variable: ${tok.value}`);
        binding.value =
          eq.value === "+="
            ? { kind: "num", value: this.num(binding.value) + this.num(rhs) }
            : rhs;
        return { value: zero, isStatement: true };
      }
      this.pos = saved;
    }
    return { value: this.parseExpression(needsValue), isStatement: false };
  }

  private parseExpression(needsValue: boolean): Value {
    return this.parseLogicalOr(needsValue);
  }

  private parseLogicalOr(needsValue: boolean): Value {
    let left = this.parseComparison(needsValue);
    for (;;) {
      const tok = this.peek();
      if (tok?.type === "op" && tok.value === "||") {
        this.next();
        const right = this.parseComparison(needsValue);
        left = {
          kind: "bool",
          value: this.num(left) !== 0 || this.num(right) !== 0,
        };
      } else {
        break;
      }
    }
    return left;
  }

  private parseComparison(needsValue: boolean): Value {
    let left = this.parseAdditive(needsValue);
    for (;;) {
      const tok = this.peek();
      if (tok?.type === "op" && this.isComparisonOp(tok.value)) {
        this.next();
        const right = this.parseAdditive(needsValue);
        left = {
          kind: "bool",
          value: this.compare(tok.value, left, right),
        };
      } else {
        break;
      }
    }
    return left;
  }

  private isComparisonOp(op: string): boolean {
    return (
      op === "==" ||
      op === "!=" ||
      op === "<" ||
      op === "<=" ||
      op === ">" ||
      op === ">="
    );
  }

  private compare(op: string, left: Value, right: Value): boolean {
    switch (op) {
      case "==":
        return left.kind === right.kind && left.value === right.value;
      case "!=":
        return !(left.kind === right.kind && left.value === right.value);
      case "<":
        return this.num(left) < this.num(right);
      case "<=":
        return this.num(left) <= this.num(right);
      case ">":
        return this.num(left) > this.num(right);
      case ">=":
        return this.num(left) >= this.num(right);
      default:
        throw new Error(`Unknown operator: ${op}`);
    }
  }

  private parseAdditive(needsValue: boolean): Value {
    let left = this.parseMultiplicative(needsValue);
    for (;;) {
      const tok = this.peek();
      if (tok?.type === "op" && (tok.value === "+" || tok.value === "-")) {
        this.next();
        const right = this.parseMultiplicative(needsValue);
        left = {
          kind: "num",
          value:
            tok.value === "+"
              ? this.num(left) + this.num(right)
              : this.num(left) - this.num(right),
        };
      } else {
        break;
      }
    }
    return left;
  }

  private parseMultiplicative(needsValue: boolean): Value {
    let left = this.parsePrimary(needsValue);
    for (;;) {
      const tok = this.peek();
      if (tok?.type === "op" && (tok.value === "*" || tok.value === "/")) {
        this.next();
        const right = this.parsePrimary(needsValue);
        left = {
          kind: "num",
          value:
            tok.value === "*"
              ? this.num(left) * this.num(right)
              : this.num(left) / this.num(right),
        };
      } else {
        break;
      }
    }
    return left;
  }

  private parsePrimary(needsValue: boolean): Value {
    const tok = this.next();
    if (tok?.type === "num") return { kind: "num", value: tok.value };
    if (tok?.type === "bool") return { kind: "bool", value: tok.value };
    if (tok?.type === "ident") {
      const binding = this.lookup(tok.value);
      if (!binding) throw new Error(`Undefined variable: ${tok.value}`);
      return binding.value;
    }
    if (tok?.type === "lparen") {
      const value = this.parseExpression(needsValue);
      if (this.next()?.type !== "rparen") throw new Error("Expected )");
      return value;
    }
    if (tok?.type === "lbrace") {
      return this.parseBlockBody(needsValue);
    }
    throw new Error("Unexpected token in expression");
  }

  private parseBlockBody(needsValue: boolean): Value {
    this.pushScope();
    let value: Value = { kind: "num", value: 0 };
    let lastWasStatement = false;
    let hasStatements = false;
    while (this.peek()?.type !== "rbrace") {
      const saved = this.pos;
      const result = this.parseStatement(false);
      value = result.value;
      lastWasStatement = result.isStatement;
      hasStatements = true;
      const isLast = this.peek()?.type === "rbrace";
      if (isLast && needsValue) {
        this.pos = saved;
        const last = this.parseStatement(true);
        value = last.value;
        lastWasStatement = last.isStatement;
      }
      if (this.peek()?.type === "semicolon") this.next();
    }
    if (needsValue && !hasStatements)
      throw new Error("Block must end with an expression");
    if (needsValue && lastWasStatement)
      throw new Error("Block must end with an expression");
    if (this.next()?.type !== "rbrace") throw new Error("Expected }");
    this.popScope();
    return value;
  }
}

export function evaluate(input: string): number {
  const tokens = tokenize(input);
  if (tokens.length === 0) return 0;
  const parser = new Parser(tokens);
  return parser.parseProgram();
}
