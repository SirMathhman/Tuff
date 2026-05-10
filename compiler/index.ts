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

  // Tokenize by splitting on whitespace.
  const tokens = tuffSourceCode.trim().split(/\s+/);

  // If there's only one token, it must be a single literal.
  if (tokens.length === 1) {
    return parseLiteral(tokens[0]!);
  }

  // For expressions with multiple terms: [term, op, term, op, ..., term].
  // tokens.length must be odd and >= 3.
  if (tokens.length < 3 || tokens.length % 2 !== 1) {
    throw new Error("Invalid format");
  }

  let accumulator = parseLiteral(tokens[0]!);

 for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i] as string;
    const rightValue = parseLiteral(tokens[i + 1]!);

    if (!["+", "-", "*", "/"].includes(op)) {
      throw new Error(`Unsupported operator: ${op}`);
    }

    let result: bigint;
    switch (op) {
      case "+":
        result = BigInt(accumulator) + BigInt(rightValue);
        break;
      case "-":
        result = BigInt(accumulator) - BigInt(rightValue);
        break;
      case "*":
        result = BigInt(accumulator) * BigInt(rightValue);
        break;
      case "/":
        if (BigInt(rightValue) === 0n) {
          throw new Error("Division by zero");
        }
        result = BigInt(accumulator) / BigInt(rightValue);
        break;
      default:
        throw new Error(`Unsupported operator: ${op}`);
    }

    // Return as number if it fits in safe integer range, otherwise bigint.
    if (result <= Number.MAX_SAFE_INTEGER && result >= -Number.MAX_SAFE_INTEGER) {
      accumulator = Number(result);
    } else {
      accumulator = result;
    }
  }



  return accumulator;
}


