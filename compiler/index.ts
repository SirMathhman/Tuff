const TUFF_RANGES: Record<string, { min: bigint; max: bigint }> = {
  U8: { min: BigInt(0), max: BigInt(255) },
  U16: { min: BigInt(0), max: BigInt(65535) },
  U32: { min: BigInt(0), max: BigInt(4294967295) },
  U64: { min: BigInt(0), max: BigInt("18446744073709551615") },
  I8: { min: BigInt(-128), max: BigInt(127) },
  I16: { min: BigInt(-32768), max: BigInt(32767) },
  I32: { min: BigInt(-2147483648), max: BigInt(2147483647) },
  I64: { min: BigInt("-9223372036854775808"), max: BigInt("9223372036854775807") },
};

export function interpretTuff(input: string): number {
  if (input === "") return 0;

  const parsed = parseExpression(input);
  if (parsed.length === 0) throw new Error(`Invalid Tuff value: ${input}`);

  // Determine the widest result range across all operand types (by bit width)
  let widestType = parsed[0]!.type;
  for (const p of parsed) {
    if (getBitWidth(p.type) > getBitWidth(widestType)) {
      widestType = p.type;
    }
  }

  const resultRange = TUFF_RANGES[widestType];
  if (!resultRange) throw new Error(`Unsupported Tuff type: ${widestType}`);

  const sum = parsed.reduce((acc, p) => acc + p.value, 0);
  if (sum < Number(resultRange.min) || sum > Number(resultRange.max)) {
    throw new Error(
      `Sum ${sum} overflows: result must be between ${resultRange.min} and ${resultRange.max}`,
    );
  }

  return sum;
}

function parseExpression(input: string): Array<{ value: number; type: string }> {
  const tokens = input.match(/(-?\d+[UI]\d+|[+-])/g);
  if (!tokens || tokens.length === 0) throw new Error(`Invalid Tuff value: ${input}`);

  const parsed: Array<{ value: number; type: string }> = [];
  let sign = 1;

  for (const token of tokens) {
    if (token === "+" || token === "-") {
      if (parsed.length > 0) {
        sign = token === "-" ? -1 : 1;
      } else {
        throw new Error(`Invalid Tuff value: ${input}`);
      }
    } else {
      const match = token.match(/^(-?\d+)([UI]\d+)$/);
      if (!match) throw new Error(`Invalid Tuff value: ${input}`);

      const rawValueStr = match[1]!;
      const typeSuffix = match[2]!;

      // Validate the literal's absolute value against its type range first
      parseTuffLiteral(rawValueStr.replace(/^-/, ""), typeSuffix);

      // Apply the operator sign to compute final contribution
      let effectiveValue: number;
      if (rawValueStr.startsWith("-")) {
        effectiveValue = -parseTuffLiteral(rawValueStr.slice(1), typeSuffix);
      } else {
        effectiveValue = parseTuffLiteral(rawValueStr, typeSuffix);
      }

      parsed.push({ value: sign * effectiveValue, type: typeSuffix });
    }
  }

  return parsed;
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
