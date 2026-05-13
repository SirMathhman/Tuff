const TUFF_RANGES: Record<string, { min: bigint; max: bigint }> = {
  U8: { min: 0n, max: 255n },
  U16: { min: 0n, max: 65535n },
  U32: { min: 0n, max: 4294967295n },
  U64: { min: 0n, max: 18446744073709551615n },
  I8: { min: -128n, max: 127n },
  I16: { min: -32768n, max: 32767n },
  I32: { min: -2147483648n, max: 2147483647n },
  I64: { min: -9223372036854775808n, max: 9223372036854775807n },
};

export function interpretTuff(input: string): number {
  if (input === "") return 0;

  // Check for addition expression like "1U8 + 2U8"
  const addMatch = input.match(/^(-?\d+)([UI]\d+)\s*\+\s*(-?\d+)([UI]\d+)$/);
  if (addMatch) {
    const leftValue = parseTuffLiteral(addMatch[1]!, addMatch[2]!);
    const rightValue = parseTuffLiteral(addMatch[3]!, addMatch[4]!);
    return leftValue + rightValue;
  }

  // Single literal like "100U8"
  const match = input.match(/^(-?\d+)([UI]\d+)/);
  if (!match) throw new Error(`Invalid Tuff value: ${input}`);

  return parseTuffLiteral(match[1]!, match[2]!);
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
