export function interpret(input: string): number {
  if (input === "") return 0;

  const tokens = input
    .split(/(\+|-|\*|\/|\(|\)|\{|\}|=|;|let)/)
    .map((s) => s.trim())
    .filter((s) => s !== "");

  let pos = 0;
  const scope = new Map<string, number>();

  function parseExpr(): number {
    let result = parseTerm();
    while (
      pos < tokens.length &&
      (tokens[pos] === "+" || tokens[pos] === "-")
    ) {
      const op = tokens[pos++];
      const right = parseTerm();
      result = op === "+" ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (
      pos < tokens.length &&
      (tokens[pos] === "*" || tokens[pos] === "/")
    ) {
      const op = tokens[pos++];
      const right = parseFactor();
      result = op === "*" ? result * right : result / right;
    }
    return result;
  }

  function parseNumber(token: string): number {
    const value = Number(token);
    if (Number.isNaN(value)) {
      throw new Error(`Invalid number: "${token}"`);
    }
    return value;
  }

  function parseBlock(): number {
    let result = 0;
    while (pos < tokens.length && tokens[pos] !== "}") {
      if (tokens[pos] === "let") {
        pos++;
        const name = tokens[pos++]!;
        if (tokens[pos] === "=") pos++;
        result = parseExpr();
        scope.set(name, result);
        if (tokens[pos] === ";") pos++;
      } else {
        result = parseExpr();
        if (tokens[pos] === ";") pos++;
      }
    }
    if (tokens[pos] === "}") pos++;
    return result;
  }

  function parseFactor(): number {
    const token = tokens[pos];
    if (token === "(") {
      pos++;
      const result = parseExpr();
      if (tokens[pos] !== ")") {
        throw new Error(
          `Expected closing bracket ")" but found "${tokens[pos] || "end of input"}"`,
        );
      }
      pos++;
      return result;
    }
    if (token === "{") {
      pos++;
      return parseBlock();
    }
    if (token !== undefined && /[a-zA-Z_]\w*/.test(token) && token !== "let") {
      pos++;
      if (scope.has(token)) return scope.get(token)!;
      return parseNumber(token);
    }
    return parseNumber(tokens[pos++]!);
  }

  return parseExpr();
}

console.log("Hello via Bun!");
