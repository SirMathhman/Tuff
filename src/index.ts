function parseAtomic(input: string): { value: number; type: string } {
  const match = input.match(/^([+-]?\d+(?:\.\d+)?)(.*)$/);
  if (!match) {
    throw new Error(`Invalid numeric string: ${input}`);
  }
  const numericPart = match[1];
  const rest = match[2];

  if (rest.length > 0) {
    // Only allow a fixed set of exact suffixes and check ranges with BigInt
    const ranges: Record<string, { min: bigint; max: bigint }> = {
      U8: { min: BigInt(0), max: BigInt(255) },
      U16: { min: BigInt(0), max: BigInt(65535) },
      U32: { min: BigInt(0), max: BigInt(4294967295) },
      U64: { min: BigInt(0), max: BigInt("18446744073709551615") },
      I8: { min: BigInt(-128), max: BigInt(127) },
      I16: { min: BigInt(-32768), max: BigInt(32767) },
      I32: { min: BigInt(-2147483648), max: BigInt(2147483647) },
      I64: {
        min: BigInt("-9223372036854775808"),
        max: BigInt("9223372036854775807"),
      },
    };

    if (!(rest in ranges)) {
      throw new Error(`Invalid numeric string: ${input}`);
    }

    // Suffixes require the numeric part to be an integer (no decimal point)
    if (numericPart.includes(".")) {
      throw new Error(`Invalid numeric string: ${input}`);
    }

    let big: bigint;
    try {
      big = BigInt(numericPart);
    } catch (e) {
      throw new Error(`Invalid numeric string: ${input}`);
    }

    const { min, max } = ranges[rest];
    if (big < min || big > max) {
      throw new Error(`Invalid numeric string: ${input}`);
    }

    // Ensure value fits into JS safe integer range to avoid precision loss
    const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
    const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);
    if (big > MAX_SAFE || big < MIN_SAFE) {
      throw new Error(`Invalid numeric string: ${input}`);
    }

    return { value: Number(big), type: rest };
  }

  const result = Number(input);
  if (Number.isNaN(result)) {
    throw new Error(`Invalid numeric string: ${input}`);
  }

  // Truncate fractional part toward zero
  return { value: Math.trunc(result), type: "none" };
}

export function interpret(input: string): number {
  const s = input;
  let pos = 0;
  const len = s.length;

  const allTerms: { value: number; type: string }[] = [];

  // Fast-path: if the input doesn't contain operators or parentheses, delegate to parseAtomic
  const trimmedInput = input.trim();
  if (!/[+\-*/()]/.test(trimmedInput)) {
    // Keep original error messages for single-token inputs (e.g., "abc")
    return parseAtomic(trimmedInput).value;
  }

  const isDigit = (ch: string) => /[0-9]/.test(ch);
  const isAlpha = (ch: string) => /[A-Za-z]/.test(ch);
  const isAlphaNum = (ch: string) => /[A-Za-z0-9]/.test(ch);

  const skipWhitespace = () => {
    while (pos < len && /\s/.test(s[pos])) pos++;
  };

  const parseNumberToken = (): string => {
    skipWhitespace();
    const start = pos;
    if (pos < len && isDigit(s[pos])) {
      while (pos < len && isDigit(s[pos])) pos++;
      if (pos < len && s[pos] === ".") {
        pos++;
        while (pos < len && isDigit(s[pos])) pos++;
      }
      // suffix: letter followed by letters/digits (e.g., U8, I64)
      if (pos < len && isAlpha(s[pos])) {
        pos++;
        while (pos < len && isAlphaNum(s[pos])) pos++;
      }
      return s.slice(start, pos);
    }
    return "";
  };

  const parseFactor = (): number => {
    skipWhitespace();
    if (pos >= len) {
      throw new Error(`Invalid expression: ${input}`);
    }

    // Unary + or -
    if (s[pos] === "+" || s[pos] === "-") {
      const sign = s[pos];
      pos++;
      skipWhitespace();
      if (pos < len && (s[pos] === "(" || s[pos] === "{")) {
        const open = s[pos];
        const close = open === "(" ? ")" : "}";
        pos++; // consume opening bracket
        const val = parseExpression();
        skipWhitespace();
        if (pos >= len || s[pos] !== close) {
          throw new Error(`Invalid expression: ${input}`);
        }
        pos++; // consume closing bracket
        return sign === "-" ? -val : val;
      }
      // If next token is a number, include the sign in the numeric token passed to parseAtomic
      const numToken = parseNumberToken();
      if (!numToken) {
        throw new Error(`Invalid expression: ${input}`);
      }
      const signedToken = sign + numToken;
      const p = parseAtomic(signedToken);
      allTerms.push(p);
      return p.value;
    }

    // Parenthesized or braced expression
    if (s[pos] === "(" || s[pos] === "{") {
      const open = s[pos];
      const close = open === "(" ? ")" : "}";
      pos++; // consume opening bracket
      const val = parseExpression();
      skipWhitespace();
      if (pos >= len || s[pos] !== close) {
        throw new Error(`Invalid expression: ${input}`);
      }
      pos++; // consume closing bracket
      return val;
    }

    // Numeric literal
    const token = parseNumberToken();
    if (!token) {
      throw new Error(`Invalid expression: ${input}`);
    }
    const p = parseAtomic(token);
    allTerms.push(p);
    return p.value;
  };

  const parseTerm = (): number => {
    let val = parseFactor();
    while (true) {
      skipWhitespace();
      if (pos < len && (s[pos] === "*" || s[pos] === "/")) {
        const op = s[pos];
        pos++;
        const rhs = parseFactor();
        if (op === "*") {
          val = val * rhs;
        } else {
          if (rhs === 0) {
            throw new Error("Division by zero");
          }
          val = Math.trunc(val / rhs);
        }
      } else break;
    }
    return val;
  };

  const parseExpression = (): number => {
    let val = parseTerm();
    while (true) {
      skipWhitespace();
      if (pos < len && (s[pos] === "+" || s[pos] === "-")) {
        const op = s[pos];
        pos++;
        const rhs = parseTerm();
        if (op === "+") val = val + rhs;
        else val = val - rhs;
      } else break;
    }
    return val;
  };

  const result = parseExpression();
  skipWhitespace();
  if (pos !== len) {
    throw new Error(`Invalid expression: ${input}`);
  }

  const explicitTypes = allTerms.map((p) => p.type).filter((t) => t !== "none");
  const uniqueExplicitTypes = Array.from(new Set(explicitTypes));
  if (uniqueExplicitTypes.length > 1) {
    throw new Error(`Mismatched types in expression: ${input}`);
  }

  return result;
}
