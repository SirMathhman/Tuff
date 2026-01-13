const RANGES: Record<string, { min: bigint; max: bigint }> = {
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

function parseAtomic(input: string): { value: number; type: string } {
  const match = input.match(/^([+-]?\d+(?:\.\d+)?)(.*)$/);
  if (!match) {
    throw new Error(`Invalid numeric string: ${input}`);
  }
  const numericPart = match[1];
  const rest = match[2];

  if (rest.length > 0) {
    if (!(rest in RANGES)) {
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

    const { min, max } = RANGES[rest];
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
  const env: Array<Map<string, { value: number; type: string }>> = [];

  // Fast-path: if the input doesn't contain operators or parentheses, delegate to parseAtomic
  const trimmedInput = input.trim();
  if (!/[+\-*/()]/.test(trimmedInput)) {
    // Keep original error messages for single-token inputs (e.g., "abc")
    return parseAtomic(trimmedInput).value;
  }

  const isDigit = (ch: string) => /[0-9]/.test(ch);
  const isAlpha = (ch: string) => /[A-Za-z]/.test(ch);
  const isAlphaNum = (ch: string) => /[A-Za-z0-9_]/.test(ch);

  const skipWhitespace = () => {
    while (pos < len && /\s/.test(s[pos])) pos++;
  };

  const expectChar = (ch: string) => {
    skipWhitespace();
    if (pos >= len || s[pos] !== ch) {
      throw new Error(`Invalid expression: ${input}`);
    }
    pos++; // consume
  };

  const mergeTypes = (a: string, b: string) => {
    const types = [a, b].filter((t) => t !== "none");
    const unique = Array.from(new Set(types));
    if (unique.length > 1)
      throw new Error(`Mismatched types in expression: ${input}`);
    return unique.length === 1 ? unique[0] : "none";
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

  const parseIdentifier = (): string => {
    skipWhitespace();
    const start = pos;
    if (pos < len && (isAlpha(s[pos]) || s[pos] === "_")) {
      pos++;
      while (pos < len && isAlphaNum(s[pos])) pos++;
      return s.slice(start, pos);
    }
    return "";
  };

  const parseFactor = (): { value: number; type: string } => {
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
        const val = s[pos - 1] === "(" ? parseExpression() : parseBlock();
        expectChar(close);
        return sign === "-" ? { value: -val.value, type: val.type } : val;
      }
      // If next token is a number, include the sign in the numeric token passed to parseAtomic
      const numToken = parseNumberToken();
      if (!numToken) {
        throw new Error(`Invalid expression: ${input}`);
      }
      const signedToken = sign + numToken;
      const p = parseAtomic(signedToken);
      allTerms.push(p);
      return p;
    }

    // Parenthesized or braced expression
    if (s[pos] === "(" || s[pos] === "{") {
      const open = s[pos];
      const close = open === "(" ? ")" : "}";
      pos++; // consume opening bracket
      const val = open === "(" ? parseExpression() : parseBlock();
      expectChar(close);
      return val;
    }

    // Identifier (variable)
    const id = parseIdentifier();
    if (id) {
      // lookup in env stack
      for (let i = env.length - 1; i >= 0; i--) {
        if (env[i].has(id)) {
          const v = env[i].get(id)!;
          allTerms.push({ value: v.value, type: v.type });
          return { value: v.value, type: v.type };
        }
      }
      throw new Error(`Invalid expression: unknown identifier: ${id}`);
    }

    // Numeric literal
    const token = parseNumberToken();
    if (!token) {
      throw new Error(`Invalid expression: ${input}`);
    }
    const p = parseAtomic(token);
    allTerms.push(p);
    return p;
  };

  const parseTerm = (): { value: number; type: string } => {
    let lhs = parseFactor();
    while (true) {
      skipWhitespace();
      if (pos < len && (s[pos] === "*" || s[pos] === "/")) {
        const op = s[pos];
        pos++;
        const rhs = parseFactor();
        // type checking: ensure explicit types don't conflict
        const resType = mergeTypes(lhs.type, rhs.type);
        let resVal: number;
        if (op === "*") resVal = lhs.value * rhs.value;
        else {
          if (rhs.value === 0) throw new Error("Division by zero");
          resVal = Math.trunc(lhs.value / rhs.value);
        }
        lhs = { value: resVal, type: resType };
      } else break;
    }
    return lhs;
  };

  const parseExpression = (): { value: number; type: string } => {
    let lhs = parseTerm();
    while (true) {
      skipWhitespace();
      if (pos < len && (s[pos] === "+" || s[pos] === "-")) {
        const op = s[pos];
        pos++;
        const rhs = parseTerm();
        // type checking
        const resType = mergeTypes(lhs.type, rhs.type);
        const resVal =
          op === "+" ? lhs.value + rhs.value : lhs.value - rhs.value;
        lhs = { value: resVal, type: resType };
      } else break;
    }
    return lhs;
  };

  const parseBlock = (): { value: number; type: string } => {
    // create new scope
    env.push(new Map());
    let last: { value: number; type: string } = { value: 0, type: "none" };
    while (true) {
      skipWhitespace();
      if (pos >= len) throw new Error(`Invalid expression: ${input}`);
      if (s[pos] === "}") break;
      // check for let
      const startPos = pos;
      const kw = parseIdentifier();
      if (kw === "let") {
        skipWhitespace();
        const name = parseIdentifier();
        if (!name) throw new Error(`Invalid expression: expected identifier`);
        skipWhitespace();
        if (s[pos] !== ":") throw new Error(`Invalid expression: expected ':'`);
        pos++;
        skipWhitespace();
        const typeName = parseIdentifier();
        if (!typeName)
          throw new Error(`Invalid expression: expected type annotation`);
        skipWhitespace();
        if (s[pos] !== "=") throw new Error(`Invalid expression: expected '='`);
        pos++;
        const rhs = parseExpression();
        skipWhitespace();
        if (s[pos] !== ";") throw new Error(`Invalid expression: expected ';'`);
        pos++;
        // validate assignment
        if (!(typeName in RANGES))
          throw new Error(`Invalid expression: unknown type ${typeName}`);
        // if rhs has explicit type and differs from annotation -> error
        if (rhs.type !== "none" && rhs.type !== typeName) {
          throw new Error(`Mismatched types in declaration: ${name}`);
        }
        // if rhs is none, ensure value in range
        if (rhs.type === "none") {
          let big: bigint;
          try {
            big = BigInt(rhs.value);
          } catch (e) {
            throw new Error(`Invalid numeric string: ${rhs.value}`);
          }
          const { min, max } = RANGES[typeName];
          if (big < min || big > max)
            throw new Error(`Invalid numeric string: ${rhs.value}`);
        }
        env[env.length - 1].set(name, { value: rhs.value, type: typeName });
        last = { value: rhs.value, type: typeName };
        continue;
      } else {
        // reset pos if not 'let'
        pos = startPos;
        const expr = parseExpression();
        skipWhitespace();
        // optional semicolon
        if (s[pos] === ";") pos++;
        last = expr;
        continue;
      }
    }
    // pop scope
    env.pop();
    return last;
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

  return result.value;
}
