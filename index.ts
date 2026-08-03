type Value = { kind: "number"; value: number } | { kind: "boolean"; value: boolean };

function numberValue(value: number): Value {
  return { kind: "number", value };
}

function booleanValue(value: boolean): Value {
  return { kind: "boolean", value };
}

function truthy(value: Value): boolean {
  return value.kind === "boolean" ? value.value : value.value !== 0;
}

export function evaluate(source: string): number {
  const tokens = source.match(/\d+|[a-zA-Z_]\w*|==|!=|<=|>=|\|\||&&|<|>|[+\-*/(){};=]/g) ?? [];
  let index = 0;
  const scopes: Array<Map<string, { value: Value; mutable: boolean }>> = [new Map()];

  function currentScope(): Map<string, { value: Value; mutable: boolean }> {
    return scopes[scopes.length - 1]!;
  }

  function lookup(name: string): { value: Value; mutable: boolean } | undefined {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const entry = scopes[i]!.get(name);
      if (entry !== undefined) {
        return entry;
      }
    }
    return undefined;
  }

  function parseOr(initial?: Value): Value {
    let value = parseEquality(initial);
    while (index < tokens.length && (tokens[index] === "||" || tokens[index] === "&&")) {
      const operator = tokens[index++];
      const right = parseEquality();
      value =
        operator === "||"
          ? booleanValue(truthy(value) || truthy(right))
          : booleanValue(truthy(value) && truthy(right));
    }
    return value;
  }

  function parseEquality(initial?: Value): Value {
    let value = parseComparison(initial);
    while (index < tokens.length && (tokens[index] === "==" || tokens[index] === "!=")) {
      const operator = tokens[index++];
      const right = parseComparison();
      const equal = value.kind === right.kind && value.value === right.value;
      value = booleanValue(operator === "==" ? equal : !equal);
    }
    return value;
  }

  function parseComparison(initial?: Value): Value {
    let value = parseExpression(initial);
    while (index < tokens.length && (tokens[index] === "<" || tokens[index] === ">" || tokens[index] === "<=" || tokens[index] === ">=")) {
      const operator = tokens[index++];
      const right = parseExpression();
      const left = value.value as number;
      const rhs = right.value as number;
      value = booleanValue(
        operator === "<" ? left < rhs : operator === ">" ? left > rhs : operator === "<=" ? left <= rhs : left >= rhs
      );
    }
    return value;
  }

  function parseExpression(initial?: Value): Value {
    let value = parseTerm(initial);
    while (index < tokens.length && (tokens[index] === "+" || tokens[index] === "-")) {
      const operator = tokens[index++];
      const right = parseTerm();
      const left = value.value as number;
      const rhs = right.value as number;
      value = numberValue(operator === "+" ? left + rhs : left - rhs);
    }
    return value;
  }

  function parseTerm(initial?: Value): Value {
    let value = initial ?? parseFactor();
    while (index < tokens.length && (tokens[index] === "*" || tokens[index] === "/")) {
      const operator = tokens[index++];
      const right = parseFactor();
      const left = value.value as number;
      const rhs = right.value as number;
      if (operator === "/" && rhs === 0) {
        throw new Error("Division by zero");
      }
      value = numberValue(operator === "*" ? left * rhs : left / rhs);
    }
    return value;
  }

  function parseFactor(): Value {
    const token = tokens[index];
    if (token === undefined) {
      return numberValue(0);
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
      return numberValue(Number(token));
    }
    if (token === "true") {
      index++;
      return booleanValue(true);
    }
    if (token === "false") {
      index++;
      return booleanValue(false);
    }
    index++; // variable reference
    const entry = lookup(token);
    if (entry === undefined) {
      throw new Error(`Undefined identifier: ${token}`);
    }
    return entry.value;
  }

  function parseBlock(): Value | undefined {
    return parseStatements("}");
  }

  function parseStatements(endToken: string | undefined): Value | undefined {
    let value: Value | undefined;
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

  const result = parseStatements(undefined);
  if (result === undefined) {
    return 0;
  }
  return result.kind === "boolean" ? (result.value ? 1 : 0) : result.value;
}