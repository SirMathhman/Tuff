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
  | { type: "bool"; value: number };

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
};

const multiCharTokens: Record<string, string> = {
  "||": "||",
  "==": "==",
};

function readToken(input: string, i: number): { token: Token; next: number } {
  const ch = input.charAt(i);
  if (/\d/.test(ch)) {
    let j = i;
    while (j < input.length && /\d/.test(input.charAt(j))) j++;
    return { token: { type: "num", value: Number(input.slice(i, j)) }, next: j };
  }
  if (/[a-zA-Z_]/.test(ch)) {
    let j = i;
    while (j < input.length && /[a-zA-Z0-9_]/.test(input.charAt(j))) j++;
    const word = input.slice(i, j);
    if (word === "let") return { token: { type: "let" }, next: j };
    if (word === "true" || word === "false")
      return { token: { type: "bool", value: word === "true" ? 1 : 0 }, next: j };
    return { token: { type: "ident", value: word }, next: j };
  }
  const twoChar = input.slice(i, i + 2);
  if (multiCharTokens[twoChar]) {
    return { token: { type: "op", value: twoChar }, next: i + 2 };
  }
  const single = singleCharTokens[ch];
  if (single) {
    return {
      token: single === "op" ? { type: "op", value: ch } : ({ type: single } as Token),
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

interface Binding {
  value: number;
  mutable: boolean;
}

class Parser {
  private pos = 0;
  private needsValue = false;

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

  private define(name: string, value: number, mutable: boolean): void {
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

  parseProgram(): number {
    let value = 0;
    while (this.pos < this.tokens.length) {
      this.needsValue = false;
      value = this.parseStatement().value;
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

  private parseStatement(): {
    value: number;
    isStatement: boolean;
  } {
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
      this.needsValue = true;
      const rhs = this.parseExpression();
      this.define(nameTok.value, rhs, isMut);
      return { value: 0, isStatement: true };
    }
    if (tok?.type === "ident") {
      const saved = this.pos;
      this.next();
      const eq = this.peek();
      if (eq?.type === "op" && eq.value === "=") {
        this.next();
        this.needsValue = true;
        const rhs = this.parseExpression();
        const binding = this.lookup(tok.value);
        if (!binding) throw new Error(`Undefined variable: ${tok.value}`);
        if (!binding.mutable)
          throw new Error(`Cannot assign to immutable variable: ${tok.value}`);
        binding.value = rhs;
        return { value: 0, isStatement: true };
      }
      this.pos = saved;
    }
    return { value: this.parseExpression(), isStatement: false };
  }

  private parseExpression(): number {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): number {
    let left = this.parseComparison();
    for (;;) {
      const tok = this.peek();
      if (tok?.type === "op" && tok.value === "||") {
        this.next();
        const right = this.parseComparison();
        left = left !== 0 || right !== 0 ? 1 : 0;
      } else {
        break;
      }
    }
    return left;
  }

  private parseComparison(): number {
    let left = this.parseAdditive();
    for (;;) {
      const tok = this.peek();
      if (tok?.type === "op" && tok.value === "==") {
        this.next();
        const right = this.parseAdditive();
        left = left === right ? 1 : 0;
      } else {
        break;
      }
    }
    return left;
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
    if (tok?.type === "bool") return tok.value;
    if (tok?.type === "ident") {
      const binding = this.lookup(tok.value);
      if (!binding) throw new Error(`Undefined variable: ${tok.value}`);
      return binding.value;
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
    this.pushScope();
    const needsValue = this.needsValue;
    let value = 0;
    let lastWasStatement = false;
    let hasStatements = false;
    while (this.peek()?.type !== "rbrace") {
      const saved = this.pos;
      this.needsValue = false;
      const result = this.parseStatement();
      value = result.value;
      lastWasStatement = result.isStatement;
      hasStatements = true;
      const isLast = this.peek()?.type === "rbrace";
      if (isLast && needsValue) {
        this.pos = saved;
        this.needsValue = true;
        const last = this.parseStatement();
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
    this.needsValue = false;
    return value;
  }
}

export function evaluate(input: string): number {
  const tokens = tokenize(input);
  if (tokens.length === 0) return 0;
  const parser = new Parser(tokens);
  return parser.parseProgram();
}
