function tokenize(source: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === " " || ch === "\t") {
      i++;
    } else if (/[0-9]/.test(ch)) {
      let num = "";
      while (i < source.length && /[0-9.]/.test(source[i]!)) {
        num += source[i++];
      }
      tokens.push(num);
    } else if (/[a-zA-Z_]/.test(ch)) {
      let word = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i]!)) {
        word += source[i++];
      }
      tokens.push(word);
    } else {
      tokens.push(ch);
      i++;
    }
  }
  return tokens;
}

function parse(tokens: string[]): number {
  let pos = 0;
  let scope: Map<string, number> = new Map();

  function peek(): string | undefined {
    return tokens[pos];
  }

  function consume(): string {
    return tokens[pos++]!;
  }

  function parseExpression(): number {
    let result = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const val = parseTerm();
      result = op === "+" ? result + val : result - val;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const val = parseFactor();
      result = op === "*" ? result * val : result / val;
    }
    return result;
  }

  function parseFactor(): number {
    const token = peek();
    if (token === "(") {
      consume();
      const result = parseExpression();
      consume(); // ")"
      return result;
    }
    if (token === "{") {
      return parseBlock();
    }
    if (token === "let") {
      return parseLetExpression();
    }
    const val = consume();
    if (scope.has(val)) {
      return scope.get(val)!;
    }
    return Number(val);
  }

  function parseBlock(): number {
    consume(); // "{"
    const childScope = new Map(scope);
    let lastVal = 0;
    while (peek() !== "}" && peek() !== undefined) {
      if (peek() === "let") {
        consume(); // "let"
        const name = consume();
        consume(); // "="
        const val = parseWithScope(childScope);
        childScope.set(name, val);
        if (peek() === ";") consume();
      } else {
        lastVal = parseWithScope(childScope);
        if (peek() === ";") consume();
      }
    }
    consume(); // "}"
    return lastVal;
  }

  function parseWithScope(newScope: Map<string, number>): number {
    const oldScope = scope;
    scope = newScope;
    const result = parseExpression();
    scope = oldScope;
    return result;
  }

  function parseLetExpression(): number {
    consume(); // "let"
    const name = consume();
    consume(); // "="
    const val = parseExpression();
    scope.set(name, val);
    if (peek() === ";") consume();
    return val;
  }

  return parseExpression();
}

export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return 0;

  return parse(tokens);
}
