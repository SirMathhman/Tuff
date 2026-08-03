export function evaluate(source: string): number {
  const tokens = source.match(/\d+|[a-zA-Z_]\w*|[+\-*/(){};=]|\|\||&&/g) ?? [];
  let index = 0;
  const scopes: Array<Map<string, { value: number; mutable: boolean }>> = [new Map()];

  function currentScope(): Map<string, { value: number; mutable: boolean }> {
    return scopes[scopes.length - 1]!;
  }

  function lookup(name: string): { value: number; mutable: boolean } | undefined {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const entry = scopes[i]!.get(name);
      if (entry !== undefined) {
        return entry;
      }
    }
    return undefined;
  }

  function parseOr(initial?: number): number {
    let value = parseExpression(initial);
    while (index < tokens.length && (tokens[index] === "||" || tokens[index] === "&&")) {
      const operator = tokens[index++];
      const right = parseExpression();
      value = operator === "||" ? (value || right ? 1 : 0) : value && right ? 1 : 0;
    }
    return value;
  }

  function parseExpression(initial?: number): number {
    let value = parseTerm(initial);
    while (index < tokens.length && (tokens[index] === "+" || tokens[index] === "-")) {
      const operator = tokens[index++];
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(initial?: number): number {
    let value = initial ?? parseFactor();
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
      scopes.push(new Map());
      const value = parseBlock();
      scopes.pop();
      index++; // consume "}"
      if (value === undefined) {
        throw new Error("Block must end with an expression");
      }
      return value;
    }
    if (/^\d+$/.test(token)) {
      index++;
      return Number(token);
    }
    if (token === "true") {
      index++;
      return 1;
    }
    if (token === "false") {
      index++;
      return 0;
    }
    index++; // variable reference
    const entry = lookup(token);
    if (entry === undefined) {
      throw new Error(`Undefined identifier: ${token}`);
    }
    return entry.value;
  }

  function parseBlock(): number | undefined {
    return parseStatements("}");
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
      } else if (tokens[index] === "{") {
        index++; // consume "{"
        scopes.push(new Map());
        const blockValue = parseStatements("}");
        scopes.pop();
        index++; // consume "}"
        if (blockValue !== undefined) {
          value = parseOr(blockValue);
          if (tokens[index] === ";") {
            index++;
          }
        }
      } else {
        value = parseOr();
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
      currentScope().set(name, { value: parseOr(), mutable });
    }
    index++; // consume ";"
  }

  function assignVariable(): void {
    const name = tokens[index++];
    index++; // consume "="
    if (name !== undefined) {
      const entry = lookup(name);
      if (entry === undefined) {
        throw new Error(`Undefined identifier: ${name}`);
      }
      if (!entry.mutable) {
        throw new Error(`Cannot assign to immutable variable: ${name}`);
      }
      entry.value = parseOr();
    }
    index++; // consume ";"
  }

  return parseStatements(undefined) ?? 0;
}