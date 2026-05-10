function parseLiteral(literal: string): number | bigint {
  const match = literal.match(/^(-?\d+)([UI])(8|16|32|64)$/);
  if (!match || !match[1] || !match[2] || !match[3]) {
    throw new Error("Invalid format");
  }

  const valueStr = match[1];
  const typePrefix = match[2]; // "U" or "I"
  const bits = parseInt(match[3], 10);

  let minValue: bigint;
  let maxValue: bigint;

  if (typePrefix === "U") {
    minValue = 0n;
    maxValue = (1n << BigInt(bits)) - 1n;
  } else {
    // Signed integers use two's complement representation
    const signBitShift = BigInt(bits) - 1n;
    minValue = -(1n << signBitShift);
    maxValue = (1n << signBitShift) - 1n;
  }

  const value = BigInt(valueStr);

  // Preserve backward-compatible error messages for unsigned types
  if (typePrefix === "U") {
    if (value < minValue) {
      throw new Error("Negative values are not supported");
    }
    if (value > maxValue) {
      throw new Error(`Value exceeds maximum for ${typePrefix}${bits}`);
    }
  } else {
    // Signed integer bounds checking
    if (value < minValue || value > maxValue) {
      throw new Error(`Value out of range for ${typePrefix}${bits}`);
    }
  }

  // If the value fits within a safe integer range, return as number. Otherwise, return bigint.
  if (value <= Number.MAX_SAFE_INTEGER && bits !== 64) {
    return Number(value);
  }

  return value;
}

export function executeTuff(tuffSourceCode: string): number | bigint {
  if (tuffSourceCode === "") {
    return 0;
  }

  // Tokenize by splitting on whitespace, then further split delimiters from literals
  const rawTokens = tuffSourceCode.trim().split(/\s+/);
  const tokens: string[] = [];
  for (const raw of rawTokens) {
    let remaining = raw;
    while (remaining.startsWith("(")) {
      tokens.push("(");
      remaining = remaining.slice(1);
    }
    while (remaining.startsWith("{")) {
      tokens.push("{");
      remaining = remaining.slice(1);
    }
    if (!remaining) continue;
    const trailingDelimiters: string[] = [];
    while (
      remaining.endsWith(")") ||
      remaining.endsWith("}") ||
      remaining.endsWith(";") ||
      remaining.endsWith(":")
    ) {
      trailingDelimiters.unshift(remaining[remaining.length - 1]!);
      remaining = remaining.slice(0, -1);
    }
    if (remaining) tokens.push(remaining);
    for (const d of trailingDelimiters) {
      tokens.push(d);
    }
  }

  let pos = 0;

  function peek(): string | undefined {
    return tokens[pos];
  }

  function consume(expected?: string): string {
    const token = tokens[pos++]!;
    if (expected && token !== expected) throw new Error("Invalid format");
    return token;
  }

  function normalizeResult(val: bigint): number | bigint {
    if (val <= Number.MAX_SAFE_INTEGER && val >= -Number.MAX_SAFE_INTEGER) {
      return Number(val);
    }
    return val;
  }

  // Variable scope for let declarations inside blocks
  const scope = new Map<string, bigint>();

  function parseIdentifier(): string {
    const name = consume();
    if (!scope.has(name)) throw new Error(`Undefined variable: ${name}`);
    return name;
  }

  // Parse a block item (statement or expression). Returns the value of an expression, null for let statements.
  function parseBlockItem(): bigint | null {
    if (peek() === "let") {
      consume("let"); // let
      const name = consume(); // variable name
      consume(":"); // :
      consume(); // type annotation (e.g., U8, I16) - ignored for evaluation
      consume("="); // =
      const value = BigInt(parseExpr());
      scope.set(name, value);
      if (peek() === ";") consume(";");
      return null;
    } else {
      const value = BigInt(parseExpr());
      if (peek() === ";") consume(";");
      return value;
    }
  }

  // Recursive descent parser with operator precedence: * / before + -
  function parseTerm(): number | bigint {
    let left: bigint;
    const token = peek();
    if (token === "(") {
      consume("(");
      const exprResult = BigInt(parseExpr());
      consume(")");
      left = exprResult;
    } else if (token === "{") {
      consume("{");
      let result: bigint | undefined;
      while (!peek() || peek() !== "}") {
        const itemValue = parseBlockItem();
        if (itemValue !== null) {
          result = itemValue;
        }
      }
      consume("}");
      left = result!;
    } else if (token && /^[a-zA-Z_]\w*$/.test(token)) {
      // Variable reference
      const name = parseIdentifier();
      left = scope.get(name)!;
    } else {
      left = BigInt(parseLiteral(consume()));
    }

    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const right = BigInt(parseTerm());
      if (op === "*") left *= right;
      else {
        if (right === 0n) throw new Error("Division by zero");
        left /= right;
      }
    }
    return normalizeResult(left);
  }

  function parseExpr(): number | bigint {
    let left = BigInt(parseTerm());
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const right = BigInt(parseTerm());
      if (op === "+") left += right;
      else left -= right;
   }
    return normalizeResult(left);
  }

  // Top-level: parse a sequence of statements/expressions, return the last expression's value
  let result: bigint | undefined;
  while (pos < tokens.length) {
    const itemValue = parseBlockItem();
    if (itemValue !== null) {
      result = itemValue;
    }
  }

  return normalizeResult(result!);
}


