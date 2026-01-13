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
  const parts = input.split(/([+-])/).filter((p) => p.trim().length > 0);

  // If the first part is an operator, it's just a signed atomic number.
  // Otherwise, if we have multiple parts or any multiplication/division, it's an expression.
  const isExpression =
    input.includes("*") ||
    input.includes("/") ||
    parts.length > 2 ||
    (parts.length === 2 && parts[0] !== "+" && parts[0] !== "-");

  if (isExpression) {
    const allTerms: { value: number; type: string }[] = [];

    // Helper to evaluate a multiplicative term (e.g. "2 * 4I8 / 2")
    const evaluateMultiplicative = (term: string) => {
      // Split by * or / while keeping the operators
      const factors = term.split(/([*/])/);
      let result = 0;
      let op = "*";

      for (let i = 0; i < factors.length; i++) {
        const factorPart = factors[i].trim();
        if (factorPart === "*" || factorPart === "/") {
          op = factorPart;
        } else {
          const p = parseAtomic(factorPart);
          allTerms.push(p);
          if (op === "*") {
            if (i === 0) {
              result = p.value;
            } else {
              result *= p.value;
            }
          } else {
            if (p.value === 0) {
              throw new Error("Division by zero");
            }
            result = Math.trunc(result / p.value);
          }
        }
      }
      return result;
    };

    let total = 0;
    let operator = "+";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (part === "+" || part === "-") {
        operator = part;
      } else {
        const val = evaluateMultiplicative(part);
        if (operator === "+") {
          total += val;
        } else {
          total -= val;
        }
      }
    }

    const explicitTypes = allTerms
      .map((p) => p.type)
      .filter((t) => t !== "none");
    const uniqueExplicitTypes = Array.from(new Set(explicitTypes));

    if (uniqueExplicitTypes.length > 1) {
      throw new Error(`Mismatched types in expression: ${input}`);
    }

    return total;
  }
  return parseAtomic(input).value;
}
