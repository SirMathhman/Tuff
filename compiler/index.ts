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

  // Check for addition expression like "1U8 + 2U8"
  const addMatch = input.match(/^(-?\d+)([UI]\d+)\s*\+\s*(-?\d+)([UI]\d+)$/);
  if (addMatch) {
    const leftValue = parseTuffLiteral(addMatch[1]!, addMatch[2]!);
    const rightValue = parseTuffLiteral(addMatch[3]!, addMatch[4]!);

    // Determine the result type by picking the wider of the two operand types
    const leftType = addMatch[2]!;
    const rightType = addMatch[4]!;
    const resultRange = getResultRange(leftType, rightType);

    const sum = leftValue + rightValue;
    if (sum < Number(resultRange.min) || sum > Number(resultRange.max)) {
      throw new Error(
        `Sum ${sum} overflows for addition of ${leftType} and ${rightType}: result must be between ${resultRange.min} and ${resultRange.max}`,
      );
    }

    return sum;
  }

  // Single literal like "100U8"
  const match = input.match(/^(-?\d+)([UI]\d+)/);
  if (!match) throw new Error(`Invalid Tuff value: ${input}`);

  return parseTuffLiteral(match[1]!, match[2]!);
}

function getResultRange(typeA: string, typeB: string): { min: bigint; max: bigint } {
  const rangeA = TUFF_RANGES[typeA];
  const rangeB = TUFF_RANGES[typeB];
  if (!rangeA || !rangeB) throw new Error(`Unsupported Tuff type`);

  // Pick the wider range (larger bit width). If same, use either.
  const bitsA = parseInt(typeA.slice(1));
  const bitsB = parseInt(typeB.slice(1));
  return bitsA >= bitsB ? rangeA : rangeB;
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
