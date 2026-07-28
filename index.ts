type Token =
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "operator"; value: "+" | "-" | "*" | "/" | "||" | "&&" }
  | { type: "compare"; value: "<" | ">" | "<=" | ">=" | "==" | "!=" }
  | { type: "paren"; value: "(" | ")" | "{" | "}" }
  | { type: "keyword"; value: string }
  | { type: "identifier"; value: string }
  | { type: "punctuator"; value: "=" | ";" }
  | { type: "compound"; value: "+=" | "-=" | "*=" | "/=" };

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
    } else if (ch === "+" && source[i + 1] === "=") {
      tokens.push({ type: "compound", value: "+=" });
      i += 2;
    } else if (ch === "-" && source[i + 1] === "=") {
      tokens.push({ type: "compound", value: "-=" });
      i += 2;
    } else if (ch === "*" && source[i + 1] === "=") {
      tokens.push({ type: "compound", value: "*=" });
      i += 2;
    } else if (ch === "/" && source[i + 1] === "=") {
      tokens.push({ type: "compound", value: "/=" });
      i += 2;
    } else if (ch && "+-*/".includes(ch)) {
      tokens.push({ type: "operator", value: ch as "+" | "-" | "*" | "/" });
      i++;
    } else if (ch === "|" && source[i + 1] === "|") {
      tokens.push({ type: "operator", value: "||" });
      i += 2;
    } else if (ch === "&" && source[i + 1] === "&") {
      tokens.push({ type: "operator", value: "&&" });
      i += 2;
    } else if (ch === "<" && source[i + 1] === "=") {
      tokens.push({ type: "compare", value: "<=" });
      i += 2;
    } else if (ch === ">" && source[i + 1] === "=") {
      tokens.push({ type: "compare", value: ">=" });
      i += 2;
    } else if (ch === "=" && source[i + 1] === "=") {
      tokens.push({ type: "compare", value: "==" });
      i += 2;
    } else if (ch === "!" && source[i + 1] === "=") {
      tokens.push({ type: "compare", value: "!=" });
      i += 2;
    } else if (ch === "<") {
      tokens.push({ type: "compare", value: "<" });
      i++;
    } else if (ch === ">") {
      tokens.push({ type: "compare", value: ">" });
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
      } else if (word === "mut") {
        tokens.push({ type: "keyword", value: "mut" });
      } else if (word === "if") {
        tokens.push({ type: "keyword", value: "if" });
      } else if (word === "else") {
        tokens.push({ type: "keyword", value: "else" });
      } else if (word === "loop") {
        tokens.push({ type: "keyword", value: "loop" });
      } else if (word === "break") {
        tokens.push({ type: "keyword", value: "break" });
      } else if (word === "true") {
        tokens.push({ type: "boolean", value: true });
      } else if (word === "false") {
        tokens.push({ type: "boolean", value: false });
      } else if (word === "or") {
        tokens.push({ type: "keyword", value: "or" });
      } else {
        tokens.push({ type: "identifier", value: word });
      }
    } else {
      i++;
    }
  }
  return tokens;
}

type VarEntry = { value: number; mutable: boolean };

class Parser {
  private tokens: Token[];
  private pos: number;
  private scope: Map<string, VarEntry>;

  constructor(tokens: Token[], scope?: Map<string, VarEntry>) {
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
    scope: Map<string, VarEntry>,
    shouldStop: () => boolean,
  ): number {
    let lastResult = 0;
    while (this.pos < this.tokens.length && !shouldStop()) {
      const t = this.peek();
      if (t && t.type === "keyword" && t.value === "let") {
        this.parseLetStatement(scope);
      } else {
        try {
          lastResult = this.parseExpression();
        } catch (e) {
          if (e instanceof Error && e.message.includes("void")) {
            lastResult = 0;
          } else {
            throw e;
          }
        }
        if (this.peek()?.type === "punctuator" && this.peek()?.value === ";") {
          this.consume();
        }
      }
    }
    return lastResult;
  }

  private parseBlockStatements(
    scope: Map<string, VarEntry>,
    shouldStop: () => boolean,
  ): { value: number; void: boolean } {
    let lastResult: { value: number; void: boolean } = {
      value: 0,
      void: false,
    };
    while (this.pos < this.tokens.length && !shouldStop()) {
      const t = this.peek();
      if (t && t.type === "keyword" && t.value === "let") {
        lastResult = this.parseLetStatementResult(scope);
      } else {
        lastResult = { value: this.parseExpression(), void: false };
        if (this.peek()?.type === "punctuator" && this.peek()?.value === ";") {
          this.consume();
        }
      }
    }
    return lastResult;
  }

  private parseLetStatementResult(scope: Map<string, VarEntry>): {
    value: number;
    void: boolean;
  } {
    this.parseLetStatement(scope);
    return { value: 0, void: true };
  }

  private parseLetStatement(scope: Map<string, VarEntry>): number {
    this.consume(); // consume "let"
    let mutable = false;
    const mutToken = this.peek();
    if (mutToken && mutToken.type === "keyword" && mutToken.value === "mut") {
      mutable = true;
      this.consume(); // consume "mut"
    }
    const idToken = this.peek();
    if (idToken && idToken.type === "identifier") {
      this.consume(); // consume identifier
      if (this.peek()?.type === "punctuator" && this.peek()?.value === "=") {
        this.consume(); // consume "="
        const value = this.parseExpression();
        scope.set(idToken.value, { value, mutable });
      } else {
        scope.set(idToken.value, { value: 0, mutable });
      }
      if (this.peek()?.type === "punctuator" && this.peek()?.value === ";") {
        this.consume(); // consume ";"
      }
    }
    return 0;
  }

  private parseExpression(): number {
    let left = this.parseAddition();
    while (this.pos < this.tokens.length) {
      const token = this.peek();
      if (
        token &&
        token.type === "operator" &&
        (token.value === "||" || token.value === "&&")
      ) {
        this.consume();
        const right = this.parseAddition();
        if (token.value === "||") {
          left = left !== 0 || right !== 0 ? 1 : 0;
        } else {
          left = left !== 0 && right !== 0 ? 1 : 0;
        }
      } else {
        break;
      }
    }
    return left;
  }

  private parseAddition(): number {
    let left = this.parseComparison();
    while (this.pos < this.tokens.length) {
      const token = this.peek();
      if (
        token &&
        token.type === "operator" &&
        (token.value === "+" || token.value === "-")
      ) {
        this.consume();
        const right = this.parseComparison();
        left = token.value === "+" ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  private parseComparison(): number {
    let left = this.parseAssignment();
    while (this.pos < this.tokens.length) {
      const token = this.peek();
      if (token && token.type === "compare") {
        this.consume();
        const right = this.parseAssignment();
        left = this.evaluateComparison(token.value, left, right);
      } else {
        break;
      }
    }
    return left;
  }

  private evaluateComparison(
    op: "<" | ">" | "<=" | ">=" | "==" | "!=",
    left: number,
    right: number,
  ): number {
    switch (op) {
      case "<":
        return left < right ? 1 : 0;
      case ">":
        return left > right ? 1 : 0;
      case "<=":
        return left <= right ? 1 : 0;
      case ">=":
        return left >= right ? 1 : 0;
      case "==":
        return left === right ? 1 : 0;
      case "!=":
        return left !== right ? 1 : 0;
    }
  }

  private parseAssignment(): number {
    const token = this.peek();
    if (token && token.type === "identifier") {
      const name = token.value;
      this.consume();
      const next = this.peek();
      if (next && next.type === "compound") {
        this.consume(); // consume compound operator
        const entry = this.scope.get(name);
        if (!entry) {
          throw new Error(`ReferenceError: '${name}' is not defined`);
        }
        if (!entry.mutable) {
          throw new Error(`Cannot assign to immutable variable '${name}'`);
        }
        const right = this.parseAssignment();
        const current = entry.value;
        let result: number;
        switch (next.value) {
          case "+=":
            result = current + right;
            break;
          case "-=":
            result = current - right;
            break;
          case "*=":
            result = current * right;
            break;
          case "/=":
            result = current / right;
            break;
        }
        entry.value = result;
        return result;
      }
      if (next && next.type === "punctuator" && next.value === "=") {
        this.consume(); // consume "="
        const value = this.parseAssignment();
        const entry = this.scope.get(name);
        if (!entry) {
          throw new Error(`ReferenceError: '${name}' is not defined`);
        }
        if (!entry.mutable) {
          throw new Error(`Cannot assign to immutable variable '${name}'`);
        }
        entry.value = value;
        return value;
      }
      if (!this.scope.has(name)) {
        throw new Error(`ReferenceError: '${name}' is not defined`);
      }
      return this.scope.get(name)!.value;
    }
    return this.parseTerm();
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
    if (token.type === "boolean") {
      this.consume();
      return token.value ? 1 : 0;
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
      const blockResult = this.parseBlockStatements(childScope, () => {
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
      if (blockResult.void) {
        throw new Error("Cannot use void block as a value");
      }
      return blockResult.value;
    }
    if (
      token.type === "operator" &&
      (token.value === "+" || token.value === "-")
    ) {
      this.consume();
      const right = this.parseFactor();
      return token.value === "+" ? right : -right;
    }
    if (token.type === "keyword" && token.value === "if") {
      this.consume(); // consume "if"
      // consume "("
      if (this.peek()?.type === "paren" && this.peek()?.value === "(") {
        this.consume();
      }
      const condition = this.parseExpression();
      // consume ")"
      if (this.peek()?.type === "paren" && this.peek()?.value === ")") {
        this.consume();
      }
      const thenValue = this.parseExpression();
      if (this.peek()?.type === "punctuator" && this.peek()?.value === ";") {
        this.consume();
      }
      // consume "else"
      if (this.peek()?.type === "keyword" && this.peek()?.value === "else") {
        this.consume();
      }
      const elseValue = this.parseExpression();
      if (this.peek()?.type === "punctuator" && this.peek()?.value === ";") {
        this.consume();
      }
      return condition !== 0 ? thenValue : elseValue;
    }
    if (token.type === "keyword" && token.value === "loop") {
      this.consume(); // consume "loop"
      // consume "{"
      if (this.peek()?.type === "paren" && this.peek()?.value === "{") {
        this.consume();
      }
      const childScope = new Map(this.scope);
      const prevScope = this.scope;
      this.scope = childScope;
      let result = 0;
      while (this.pos < this.tokens.length) {
        const t = this.peek();
        if (t?.type === "paren" && t.value === "}") {
          this.consume();
          break;
        }
        if (t?.type === "keyword" && t.value === "break") {
          this.consume(); // consume "break"
          result = this.parseExpression();
          if (
            this.peek()?.type === "punctuator" &&
            this.peek()?.value === ";"
          ) {
            this.consume();
          }
          break;
        }
        result = this.parseExpression();
        if (this.peek()?.type === "punctuator" && this.peek()?.value === ";") {
          this.consume();
        }
      }
      this.scope = prevScope;
      return result;
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
