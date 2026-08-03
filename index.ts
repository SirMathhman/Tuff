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
  const invalid = source.match(/[^\s\d\w+\-*/(){};=<>!&|]/);
  if (invalid) {
    throw new Error(`Invalid character: ${invalid[0]}`);
  }
  const tokens = source.match(/\d+[A-Za-z]\w*|\d+|[a-zA-Z_]\w*|==|!=|<=|>=|\+=|-=|\*=|\/=|\|\||&&|<|>|[+\-*/(){};=]/g) ?? [];
  let index = 0;
  let breakRequested = false;
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
    if (token === "-") {
      index++;
      const value = parseFactor();
      if (value.kind === "number" && /U8$/.test(tokens[index - 1] ?? "")) {
        throw new Error("U8 literal cannot be negative");
      }
      return numberValue(-(value.value as number));
    }
    if (/^\d+[A-Za-z]\w*$/.test(token)) {
      index++;
      const value = Number(token.match(/^\d+/)?.[0]);
      const suffix = token.match(/[A-Za-z]\w*$/)?.[0];
      if (suffix === "U8" && value > 255) {
        throw new Error("U8 literal out of range");
      }
      return numberValue(value);
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
    if (token === "if") {
      index++; // consume "if"
      index++; // consume "("
      const condition = parseOr();
      index++; // consume ")"
      const thenValue = parseOr();
      if (tokens[index] !== "else") {
        throw new Error("If expression requires an else branch");
      }
      index++; // consume "else"
      const elseValue = parseOr();
      return truthy(condition) ? thenValue : elseValue;
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

  function isAssignmentOperator(token: string | undefined): boolean {
    return token === "=" || token === "+=" || token === "-=" || token === "*=" || token === "/=";
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
      } else if (isAssignmentOperator(tokens[index + 1])) {
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
      } else if (tokens[index] === "if") {
        parseIfStatement();
      } else if (tokens[index] === "while") {
        parseWhileStatement();
      } else if (tokens[index] === "continue") {
        index++; // consume "continue"
        index++; // consume ";"
      } else if (tokens[index] === "break") {
        index++; // consume "break"
        index++; // consume ";"
        breakRequested = true;
        break;
      } else {
        value = parseOr();
        if (tokens[index] === ";") {
          index++;
        }
      }
    }
    return value;
  }

  function parseWhileStatement(): void {
    index++; // consume "while"
    index++; // consume "("
    const conditionStart = index;
    while (true) {
      const condition = parseOr();
      index++; // consume ")"
      if (!truthy(condition)) {
        skipBranchStatement();
        break;
      }
      parseBranchStatement();
      if (breakRequested) {
        breakRequested = false;
        break;
      }
      index = conditionStart;
    }
  }

  function parseIfStatement(): void {
    index++; // consume "if"
    index++; // consume "("
    const condition = parseOr();
    index++; // consume ")"
    if (truthy(condition)) {
      parseBranchStatement();
      skipElseChain();
    } else {
      skipBranchStatement();
      parseElseChain();
    }
  }

  function parseElseChain(): void {
    if (tokens[index] !== "else") {
      return;
    }
    index++; // consume "else"
    if (tokens[index] === "if") {
      parseIfStatement();
    } else {
      parseBranchStatement();
    }
  }

  function skipElseChain(): void {
    if (tokens[index] !== "else") {
      return;
    }
    index++; // consume "else"
    if (tokens[index] === "if") {
      skipIfStatement();
    } else {
      skipBranchStatement();
    }
  }

  function skipIfStatement(): void {
    index++; // consume "if"
    index++; // consume "("
    parseOr();
    index++; // consume ")"
    skipBranchStatement();
    skipElseChain();
  }

  function parseBranchStatement(): void {
    if (tokens[index] === "{") {
      index++; // consume "{"
      scopes.push(new Map());
      parseStatements("}");
      scopes.pop();
      index++; // consume "}"
    } else if (isAssignmentOperator(tokens[index + 1])) {
      assignVariable();
    } else {
      parseOr();
      if (tokens[index] === ";") {
        index++;
      }
    }
  }

  function skipBranchStatement(): void {
    if (tokens[index] === "{") {
      index++; // consume "{"
      scopes.push(new Map());
      skipStatements("}");
      scopes.pop();
      index++; // consume "}"
    } else if (isAssignmentOperator(tokens[index + 1])) {
      index++; // name
      index++; // operator
      parseOr();
      index++; // ";"
    } else {
      parseOr();
      if (tokens[index] === ";") {
        index++;
      }
    }
  }

  function skipStatements(endToken: string | undefined): void {
    while (index < tokens.length && tokens[index] !== endToken) {
      if (tokens[index] === "let") {
        index++; // consume "let"
        if (tokens[index] === "mut") {
          index++;
        }
        index++; // name
        index++; // "="
        parseOr();
        index++; // ";"
      } else if (isAssignmentOperator(tokens[index + 1])) {
        index++; // name
        index++; // operator
        parseOr();
        index++; // ";"
      } else if (tokens[index] === "{") {
        index++; // consume "{"
        scopes.push(new Map());
        skipStatements("}");
        scopes.pop();
        index++; // consume "}"
      } else if (tokens[index] === "if") {
        index++; // consume "if"
        index++; // consume "("
        parseOr();
        index++; // consume ")"
        skipBranchStatement();
        if (tokens[index] !== "else") {
          throw new Error("If expression requires an else branch");
        }
        index++; // consume "else"
        skipBranchStatement();
      } else if (tokens[index] === "continue") {
        index++; // consume "continue"
        index++; // consume ";"
      } else {
        parseOr();
        if (tokens[index] === ";") {
          index++;
        }
      }
    }
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
    const operator = tokens[index++]; // "=", "+=", "-=", "*=", "/="
    if (name !== undefined) {
      const entry = lookup(name);
      if (entry === undefined) {
        throw new Error(`Undefined identifier: ${name}`);
      }
      if (!entry.mutable) {
        throw new Error(`Cannot assign to immutable variable: ${name}`);
      }
      const rhs = parseOr();
      if (operator === "=") {
        entry.value = rhs;
      } else {
        const left = entry.value.value as number;
        const right = rhs.value as number;
        entry.value = numberValue(
          operator === "+=" ? left + right : operator === "-=" ? left - right : operator === "*=" ? left * right : left / right
        );
      }
    }
    index++; // consume ";"
  }

  const result = parseStatements(undefined);
  if (result === undefined) {
    return 0;
  }
  return result.kind === "boolean" ? (result.value ? 1 : 0) : result.value;
}