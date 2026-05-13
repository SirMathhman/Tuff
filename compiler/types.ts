export const TUFF_RANGES: Record<string, { min: bigint; max: bigint }> = {
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
  Bool: { min: BigInt(0), max: BigInt(1) },
};

export type ArrayBinding = {
  values: number[];
  elementType: string;
  length: number;
  mutable: boolean;
};

export type Binding = Record<
  string,
  { value: number; type: string; mutable: boolean } | ArrayBinding
>;

// Bool has bit width 1 so it promotes to any numeric type.
export function getBitWidth(typeSuffix: string): number {
  if (typeSuffix === "Bool") return 1;
  const num = parseInt(typeSuffix.slice(1));
  if (isNaN(num)) throw new Error(`Unsupported Tuff type: ${typeSuffix}`);
  return num;
}

export function parseTuffLiteral(valueStr: string, typeSuffix: string): number {
  // Bool is handled separately in the parser.
  if (!TUFF_RANGES[typeSuffix]) {
    throw new Error(`Unsupported Tuff type: ${typeSuffix}`);
  }

  const bigValue = BigInt(valueStr);
  if (
    bigValue < TUFF_RANGES[typeSuffix]!.min ||
    bigValue > TUFF_RANGES[typeSuffix]!.max
  ) {
    throw new Error(
      `Value ${valueStr} out of range for ${typeSuffix}: ${TUFF_RANGES[typeSuffix]!.min} to ${TUFF_RANGES[typeSuffix]!.max}`,
    );
  }

  return Number(bigValue);
}

// Check if a type string is an array type like "[U8; 3]".
export function isArrayType(t: string): boolean {
  return t.startsWith("[") && t.includes(";");
}

// Parse the element type and length from an array type string.
export function parseArrayType(
  t: string,
): { elementType: string; length: number } | undefined {
  const match = t.match(/^\[([UI]\d+|I\d+);\s*(\d+)\]$/);
  if (!match) return undefined;
  return { elementType: match[1]!, length: parseInt(match[2]!) };
}
