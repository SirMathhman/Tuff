export function evaluate(source: string): number {
  const tokens = source.match(/\d+|[a-zA-Z_]\w*|[+\-*/(){};=]/g) ?? [];
  let index = 0;
  const scope = new Map<string, { value: number; mutable: boolean }>();

  function parseExpression(): number {
    let value = parseTerm();
    while (index < tokens.length && (tokens[index] === "+" || tokens[index] === "-")) {
      const operator = tokens[index++];
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (index < tokens.length && (tokens[index] === "*" || tokens[index] === "/")) {
      const operator = tokens[index++];
      const right = parseFactor();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  function parseFactor(): number {
    const token = tokens[index];
    if (token === undefined) {
      return 0;
    }
    if (token === "(") {
      index++;
      const value = parseExpression();
      index++; // consume ")"
      return value;
    }
    if (token === "{") {
      index++;
      const value = parseBlock();
      index++; // consume "}"
      return value;
    }
    if (/^\d+$/.test(token)) {
      index++;
      return Number(token);
    }
    index++; // variable reference
    const entry = scope.get(token);
    if (entry === undefined) {
      throw new Error(`Undefined identifier: ${token}`);
    }
    return entry.value;
  }

  function parseBlock(): number {
    const value = parseStatements("}");
    if (value === undefined) {
      throw new Error("Block must end with an expression");
    }
    return value;
  }

  function parseStatements(endToken: string | undefined): number | undefined {
    let value: number | undefined;
    while (index < tokens.length && tokens[index] !== endToken) {
      if (tokens[index] === "let") {
        index++; // consume "let"
        const mutable = tokens[index] === "mut";
        if (mutable) {
          index++; // consume "mut"
        }
        declareVariable(mutable);
      } else if (tokens[index + 1] === "=") {
        assignVariable();
      } else {
        value = parseExpression();
        if (tokens[index] === ";") {
          index++;
        }
      }
    }
    return value;
  }

  function declareVariable(mutable: boolean): void {
    const name = tokens[index++];
    index++; // consume "="
    if (name !== undefined) {
      scope.set(name, { value: parseExpression(), mutable });
    }
    index++; // consume ";"
  }

  function assignVariable(): void {
    const name = tokens[index++];
    index++; // consume "="
    if (name !== undefined) {
      const entry = scope.get(name);
      if (entry === undefined) {
        throw new Error(`Undefined identifier: ${name}`);
      }
      if (!entry.mutable) {
        throw new Error(`Cannot assign to immutable variable: ${name}`);
      }
      entry.value = parseExpression();
    }
    index++; // consume ";"
  }

  return parseStatements(undefined) ?? 0;
}
