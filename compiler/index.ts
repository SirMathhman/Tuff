const TUFF_RANGES: Record<string, { min: bigint; max: bigint }> = {
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

export function interpretTuff(input: string): number {
  if (input === "") return 0;

  const tokens = tokenize(input);
  const result = evaluateExpression(tokens, input);

  const resultRange = TUFF_RANGES[result.type];
  if (!resultRange) throw new Error(`Unsupported Tuff type: ${result.type}`);

  if (
    result.value < Number(resultRange.min) ||
    result.value > Number(resultRange.max)
  ) {
    throw new Error(
      `Result ${result.value} overflows for type ${result.type}: must be between ${resultRange.min} and ${resultRange.max}`,
    );
  }

  return result.value;
}

function evaluateExpression(
  tokens: Array<string>,
  input: string,
): { value: number; type: string } {
  let pos = 0;

  function parseTerm(): { value: number; type: string } {
    const left = parseLiteral();
    while (pos < tokens.length && tokens[pos] === "*") {
      pos++;
      const right = parseLiteral();
      if (getBitWidth(right.type) > getBitWidth(left.type)) {
        left.type = right.type;
      }
      left.value *= right.value;
    }
    return left;
  }

  function parseLiteral(): { value: number; type: string } {
    const token = tokens[pos]!;
    pos++;
    const match = token.match(/^(-?\d+)([UI]\d+)$/);
    if (!match) throw new Error(`Invalid Tuff value: ${input}`);

    const rawValueStr = match[1]!;
    const typeSuffix = match[2]!;

    parseTuffLiteral(rawValueStr.replace(/^-/, ""), typeSuffix);

    let effectiveValue: number;
    if (rawValueStr.startsWith("-")) {
      effectiveValue = -parseTuffLiteral(rawValueStr.slice(1), typeSuffix);
    } else {
      effectiveValue = parseTuffLiteral(rawValueStr, typeSuffix);
    }

    return { value: effectiveValue, type: typeSuffix };
  }

  // eslint-disable-next-line prefer-const -- mutated in place, not reassigned
  let result = parseTerm();
  while (pos < tokens.length) {
    const op = tokens[pos]!;
    pos++;
    if (op !== "+" && op !== "-")
      throw new Error(`Invalid Tuff value: ${input}`);

    const term = parseTerm();
    const widestType =
      getBitWidth(term.type) > getBitWidth(result.type)
        ? term.type
        : result.type;
    result.value += op === "-" ? -term.value : term.value;
    result.type = widestType;
  }

  return result;
}

function tokenize(input: string): Array<string> {
  const tokens = input.match(/(-?\d+[UI]\d+|[+\-*])/g);
  if (!tokens || tokens.length === 0)
    throw new Error(`Invalid Tuff value: ${input}`);
  return tokens;
}

function getBitWidth(typeSuffix: string): number {
  const num = parseInt(typeSuffix.slice(1));
  if (isNaN(num)) throw new Error(`Unsupported Tuff type: ${typeSuffix}`);
  return num;
}

function parseTuffLiteral(valueStr: string, typeSuffix: string): number {
  const range = TUFF_RANGES[typeSuffix];
  if (!range) throw new Error(`Unsupported Tuff type: ${typeSuffix}`);

  const bigValue = BigInt(valueStr);
  if (bigValue < range.min || bigValue > range.max) {
    throw new Error(
      `Value ${valueStr} out of range for ${typeSuffix}: ${range.min} to ${range.max}`,
    );
  }

  return Number(bigValue);
}
