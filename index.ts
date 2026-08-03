type Value =
  | { kind: "number"; value: number; type?: string }
  | { kind: "boolean"; value: boolean }
  | {
      kind: "reference";
      target: { value: Value; mutable: boolean };
      type?: string;
    };

function numberValue(value: number, type?: string): Value {
  return { kind: "number", value, type };
}

function booleanValue(value: boolean): Value {
  return { kind: "boolean", value };
}

function truthy(value: Value): boolean {
  if (value.kind === "reference") {
    return truthy(value.target.value);
  }
  return value.kind === "boolean" ? value.value : value.value !== 0;
}

function toNumber(value: Value): number {
  if (value.kind === "reference") {
    return toNumber(value.target.value);
  }
  if (value.kind === "boolean") {
    return value.value ? 1 : 0;
  }
  return value.value;
}

function valueType(value: Value): string | undefined {
  if (value.kind === "number") {
    return value.type;
  }
  if (value.kind === "reference") {
    return value.type;
  }
  return "Bool";
}

function typeSize(type: string): number {
  const match = type.match(/U(\d+)/);
  return match ? Number(match[1]) : 0;
}

function assertAssignable(
  sourceType: string | undefined,
  targetType: string | undefined,
): void {
  if (sourceType === undefined || targetType === undefined) {
    return;
  }
  if (sourceType === "Bool" && targetType !== "Bool") {
    throw new Error(`Type mismatch: cannot assign Bool to ${targetType}`);
  }
  if (sourceType !== "Bool" && targetType === "Bool") {
    throw new Error(`Type mismatch: cannot assign ${sourceType} to Bool`);
  }
  if (
    sourceType !== "Bool" &&
    targetType !== "Bool" &&
    typeSize(sourceType) > typeSize(targetType)
  ) {
    throw new Error(
      `Type mismatch: cannot assign ${sourceType} to ${targetType}`,
    );
  }
}

export function evaluate(source: string): number {
  const invalid = source.match(/[^\s\d\w+\-*/(){};=<>!&|:,]/);
  if (invalid) {
    throw new Error(`Invalid character: ${invalid[0]}`);
  }
  const tokens =
    source.match(
      /\d+[A-Za-z]\w*|\d+|[a-zA-Z_]\w*|==|!=|<=|>=|\+=|-=|\*=|\/=|=>|\|\||&&|<|>|[+\-*/&(){};=:,]/g,
    ) ?? [];
  let index = 0;
  let breakRequested = false;
  const scopes: Array<Map<string, { value: Value; mutable: boolean }>> = [
    new Map(),
  ];
  const functions = new Map<string, { params: Array<{ name: string; type: string }>; body: number; returnType: string }>();

  function currentScope(): Map<string, { value: Value; mutable: boolean }> {
    return scopes[scopes.length - 1]!;
  }

  function lookup(
    name: string,
  ): { value: Value; mutable: boolean } | undefined {
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
    while (
      index < tokens.length &&
      (tokens[index] === "||" || tokens[index] === "&&")
    ) {
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
    while (
      index < tokens.length &&
      (tokens[index] === "==" || tokens[index] === "!=")
    ) {
      const operator = tokens[index++];
      const right = parseComparison();
      const equal =
        value.kind === right.kind && toNumber(value) === toNumber(right);
      value = booleanValue(operator === "==" ? equal : !equal);
    }
    return value;
  }

  function parseComparison(initial?: Value): Value {
    let value = parseExpression(initial);
    while (
      index < tokens.length &&
      (tokens[index] === "<" ||
        tokens[index] === ">" ||
        tokens[index] === "<=" ||
        tokens[index] === ">=")
    ) {
      const operator = tokens[index++];
      const right = parseExpression();
      const left = toNumber(value);
      const rhs = toNumber(right);
      value = booleanValue(
        operator === "<"
          ? left < rhs
          : operator === ">"
            ? left > rhs
            : operator === "<="
              ? left <= rhs
              : left >= rhs,
      );
    }
    return value;
  }

  function parseExpression(initial?: Value): Value {
    let value = parseTerm(initial);
    while (
      index < tokens.length &&
      (tokens[index] === "+" || tokens[index] === "-")
    ) {
      const operator = tokens[index++];
      const right = parseTerm();
      const left = toNumber(value);
      const rhs = toNumber(right);
      value = numberValue(operator === "+" ? left + rhs : left - rhs);
    }
    return value;
  }

  function parseTerm(initial?: Value): Value {
    let value = initial ?? parseFactor();
    while (
      index < tokens.length &&
      (tokens[index] === "*" || tokens[index] === "/")
    ) {
      const operator = tokens[index++];
      const right = parseFactor();
      const left = toNumber(value);
      const rhs = toNumber(right);
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
      return numberValue(-toNumber(value));
    }
    if (token === "&") {
      index++;
      const name = tokens[index++];
      if (name === undefined) {
        throw new Error("Expected identifier after &");
      }
      const entry = lookup(name);
      if (entry === undefined) {
        throw new Error(`Undefined identifier: ${name}`);
      }
      const targetType = valueType(entry.value);
      return {
        kind: "reference",
        target: entry,
        type: targetType === undefined ? undefined : `&${targetType}`,
      };
    }
    if (token === "*") {
      index++;
      const ref = parseFactor();
      if (ref.kind !== "reference") {
        throw new Error("Cannot dereference non-reference");
      }
      return ref.target.value;
    }
    if (/^\d+[A-Za-z]\w*$/.test(token)) {
      index++;
      const value = Number(token.match(/^\d+/)?.[0]);
      const suffix = token.match(/[A-Za-z]\w*$/)?.[0];
      if (suffix === "U8" && value > 255) {
        throw new Error("U8 literal out of range");
      }
      return numberValue(value, suffix);
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
    if (tokens[index + 1] === "(") {
      return parseFunctionCall();
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
    return (
      token === "=" ||
      token === "+=" ||
      token === "-=" ||
      token === "*=" ||
      token === "/="
    );
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
      } else if (tokens[index] === "fn") {
        parseFunctionDefinition();
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

  function parseFunctionDefinition(): void {
    index++; // consume "fn"
    const name = tokens[index++];
    index++; // consume "("
    const params: Array<{ name: string; type: string }> = [];
    while (tokens[index] !== ")") {
      const param = tokens[index++];
      index++; // consume ":"
      const type = tokens[index++];
      if (param !== undefined && type !== undefined) {
        params.push({ name: param, type });
      }
      if (tokens[index] === ",") {
        index++;
      }
    }
    index++; // consume ")"
    let returnType: string | undefined;
    if (tokens[index] === ":") {
      index++; // consume ":"
      returnType = tokens[index++];
    }
    index++; // consume "=>"
    const body = index;
    // Skip to the end of the body: a balanced block or the terminating ";"
    if (tokens[index] === "{") {
      let depth = 0;
      do {
        if (tokens[index] === "{") {
          depth++;
        } else if (tokens[index] === "}") {
          depth--;
        }
        index++;
      } while (depth > 0 && index < tokens.length);
    } else {
      while (index < tokens.length && tokens[index] !== ";") {
        index++;
      }
      index++; // consume ";"
    }
    if (name !== undefined && returnType !== undefined) {
      const fn = { params, body, returnType };
      functions.set(name, fn);
      // Validate that the body's value is assignable to the declared return type.
      const placeholderArgs = params.map((param) =>
        param.type === "Bool"
          ? booleanValue(false)
          : numberValue(0, param.type),
      );
      const bodyValue = invokeFunction(fn, placeholderArgs);
      assertAssignable(valueType(bodyValue), returnType);
    }
  }

  function invokeFunction(
    fn: {
      params: Array<{ name: string; type: string }>;
      body: number;
      returnType: string;
    },
    args: Value[],
  ): Value {
    scopes.push(new Map());
    fn.params.forEach((param, i) => {
      const arg = args[i];
      if (arg !== undefined) {
        assertAssignable(valueType(arg), param.type);
        currentScope().set(param.name, { value: arg, mutable: false });
      }
    });
    const savedIndex = index;
    index = fn.body;
    const result = parseOr();
    index = savedIndex;
    scopes.pop();
    return result;
  }

  function parseFunctionCall(): Value {
    const name = tokens[index++];
    index++; // consume "("
    const fn = functions.get(name ?? "");
    if (fn === undefined) {
      throw new Error(`Undefined function: ${name}`);
    }
    const args: Value[] = [];
    while (tokens[index] !== ")") {
      args.push(parseOr());
      if (tokens[index] === ",") {
        index++;
      }
    }
    index++; // consume ")"
    const result = invokeFunction(fn, args);
    if (fn.returnType === "Bool") {
      return booleanValue(truthy(result));
    }
    return numberValue(toNumber(result), fn.returnType);
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
    let declaredType: string | undefined;
    if (tokens[index] === ":") {
      index++; // consume ":"
      if (tokens[index] === "&") {
        index++; // consume "&"
        declaredType = `&${tokens[index++]}`;
      } else {
        declaredType = tokens[index++];
      }
    }
    index++; // consume "="
    if (name !== undefined) {
      const value = parseOr();
      assertAssignable(valueType(value), declaredType);
      currentScope().set(name, { value, mutable });
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
        assertAssignable(valueType(rhs), valueType(entry.value));
        entry.value = rhs;
      } else {
        const left = toNumber(entry.value);
        const right = toNumber(rhs);
        entry.value = numberValue(
          operator === "+="
            ? left + right
            : operator === "-="
              ? left - right
              : operator === "*="
                ? left * right
                : left / right,
        );
      }
    }
    index++; // consume ";"
  }

  const result = parseStatements(undefined);
  if (result === undefined) {
    return 0;
  }
  return toNumber(result);
}
