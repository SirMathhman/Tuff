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
    // Handle leading & as a separate token (reference operator)
    if (remaining.startsWith("&")) {
      tokens.push("&");
      remaining = remaining.slice(1);
    }
    // Handle leading * followed by identifier as dereference: split into "*" and the rest
    // But keep "*U8", "*I16" etc. together as pointer type annotations
    if (remaining.startsWith("*") && !/^\*[UI]/.test(remaining)) {
      tokens.push("*");
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

  // Variable scope for let declarations inside blocks: tracks both value and type string
  const scope = new Map<
    string,
    { value: bigint; type: string; mutable: boolean }
  >();

  function parseIdentifier(): string {
    const name = consume();
    if (!scope.has(name)) throw new Error(`Undefined variable: ${name}`);
    return name;
  }
  // Parse a type annotation like U8, I16, *U8, etc. Returns the full token (e.g., "U8" or "*U8")
  function parseTypeAnnotation(): string {
    const typeToken = consume();
    if (
      !/^[UI](8|16|32|64)$/.test(typeToken) &&
      !/^\*[UI](8|16|32|64)$/.test(typeToken)
    )
      throw new Error(`Invalid type: ${typeToken}`);
    return typeToken;
  }

  // Infer the type of a literal token (e.g., "U8" from "100U8")
  function inferLiteralType(literal: string): string {
    const match = literal.match(/^(-?\d+)([UI](?:8|16|32|64))$/);
    if (!match) throw new Error("Invalid format");
    return match[2]!; // e.g., "U8", "I16"
  }

  // Check if sourceType can be assigned to targetType (strict: must have same bit width or narrower)
  function isAssignable(sourceType: string, targetType: string): boolean {
    // Handle pointer types: a reference (*T) should match the base type T in assignment context
    const srcBase = sourceType.replace(/^\*/, "");
    const tgtBase = targetType.replace(/^\*/, "");

    const srcMatch = srcBase.match(/^([UI])(\d+)$/);
    const tgtMatch = tgtBase.match(/^([UI])(\d+)$/);
    if (!srcMatch || !tgtMatch) return false;

    // Same signedness required (U can't go to I and vice versa for now, keep it simple: must match exactly)
    if (srcMatch[1] !== tgtMatch[1]) return false;
    const srcBits = parseInt(srcMatch[2]!, 10);
    const tgtBits = parseInt(tgtMatch[2]!, 10);

    // Source type bits must be <= target type bits for safe assignment
    return srcBits <= tgtBits;
  }

  function parseBlockItem(): bigint | null {
    if (peek() === "let") {
      consume("let"); // let

      // Check for optional `mut` keyword
      const mutable = peek() === "mut";
      if (mutable) consume("mut");

      const name = consume(); // variable name

      let declaredType: string | undefined;
      // Type annotation is optional: `:` followed by type token may or may not be present
      if (peek() === ":") {
        consume(":"); // :
        declaredType = parseTypeAnnotation();
      }

      consume("="); // =
      const exprResult = parseExprWithType();
      const value = BigInt(exprResult.value);

      // If a type was explicitly declared, check compatibility with the expression's inferred type
      if (declaredType) {
        if (!isAssignable(exprResult.type, declaredType)) {
          throw new Error(
            `Cannot assign ${exprResult.type} to variable of type ${declaredType}`,
          );
        }
        scope.set(name, { value, type: declaredType, mutable });
      } else {
        // No explicit type annotation — infer from the expression's literal type if possible
        scope.set(name, { value, type: exprResult.type, mutable });
      }

      if (peek() === ";") consume(";");
      return null;
    } else if (
      peek() &&
      /^[a-zA-Z_]\w*$/.test(peek()!) &&
      tokens[pos + 1] === "="
    ) {
      // Assignment expression: `x = value` — returns the assigned value
      const name = consume();
      const entry = scope.get(name);
      if (!entry || !entry.mutable) {
        throw new Error(`Cannot reassign immutable variable: ${name}`);
      }

      consume("="); // =
      const exprResult = parseExprWithType();
      const value = BigInt(exprResult.value);

      // Check type compatibility for the assignment
      if (!isAssignable(exprResult.type, entry.type)) {
        throw new Error(
          `Cannot assign ${exprResult.type} to variable of type ${entry.type}`,
        );
      }

      scope.set(name, { ...entry, value });

      if (peek() === ";") consume(";");
      return value;
    } else {
      const exprResult = parseExprWithType();
      if (peek() === ";") consume(";");
      return BigInt(exprResult.value);
    }
  }

  // Extended expression parser that also tracks the inferred type of the result

  function parseExprWithType(): { value: number | bigint; type: string } {
    let left = parseTermWithType();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const right = parseTermWithType();

      // When combining types, widen to the larger bit width and keep signedness consistent
      const combinedType = combineTypes(left.type, right.type);

      if (op === "+") left.value = BigInt(left.value) + BigInt(right.value);
      else left.value = BigInt(left.value) - BigInt(right.value);

      left.type = combinedType;
    }
    return { value: normalizeResult(BigInt(left.value)), type: left.type };
  }

 function parseTermWithType(): { value: number | bigint; type: string } {
    let result: { value: bigint; type: string };
    const token = peek();
    if (token === "(") {
      consume("(");
      const innerResult = parseExprWithType();
      consume(")");
      result = { value: BigInt(innerResult.value), type: innerResult.type };
    } else if (token === "{") {
      consume("{");
      let blockValue: bigint | undefined;
      while (!peek() || peek() !== "}") {
        const itemValue = parseBlockItem();
        if (itemValue !== null) {
          blockValue = itemValue;
        }
      }
      consume("}");
      result = { value: blockValue!, type: "U8" };
    } else if (token === "&") {
      // Reference operator — returns pointer type *T
      consume("&");
      const name = parseIdentifier();
      const entry = scope.get(name)!;
      result = { value: entry.value, type: "*" + entry.type };
    } else if (token === "*") {
      // Dereference operator — strips the leading * to get base type T
      consume("*");
      const name = parseIdentifier();
      const entry = scope.get(name)!;
      result = { value: entry.value, type: entry.type.replace(/^\*/, "") };
    } else if (token && /^[a-zA-Z_]\w*$/.test(token)) {
      // Variable reference — use the stored type from scope
      const name = parseIdentifier();
      const entry = scope.get(name)!;
      result = { value: entry.value, type: entry.type };
    } else {
      const literalToken = consume();
      result = {
        value: BigInt(parseLiteral(literalToken)),
        type: inferLiteralType(literalToken),
      };
    }

    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const rightResult = parseTermWithType();

      // Combine types for multiplication/division — widen to larger bit width
      result.type = combineTypes(result.type, rightResult.type);

      if (op === "*") result.value *= BigInt(rightResult.value);
      else {
        if (BigInt(rightResult.value) === 0n) throw new Error("Division by zero");
        result.value /= BigInt(rightResult.value);
      }
    }
    return { value: normalizeResult(result.value), type: result.type };
  }



  // Combine two types into a wider one that can hold both values safely
  function combineTypes(typeA: string, typeB: string): string {
    const matchA = typeA.match(/^([UI])(\d+)$/);
    const matchB = typeB.match(/^([UI])(\d+)$/);

    if (!matchA || !matchB) return "U64"; // fallback to widest

    const prefixA = matchA[1];
    const bitsA = parseInt(matchA[2]!, 10);
    const prefixB = matchB[1];
    const bitsB = parseInt(matchB[2]!, 10);

    // If either is signed, result is signed (I) to preserve sign semantics
    const combinedPrefix = prefixA === "I" || prefixB === "I" ? "I" : "U";
    const combinedBits = Math.max(bitsA, bitsB);

    return `${combinedPrefix}${combinedBits}`;
  }

  // Top-level: parse a sequence of statements/expressions, return the last expression's value (or 0 if none)

  // Top-level: parse a sequence of statements/expressions, return the last expression's value (or 0 if none)
  let result = 0n;
  while (pos < tokens.length) {
    const itemValue = parseBlockItem();
    if (itemValue !== null) {
      result = BigInt(itemValue);
    }
  }

  return normalizeResult(result);
}
