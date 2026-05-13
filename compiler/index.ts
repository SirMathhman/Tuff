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

  const match = input.match(/^(-?\d+)([UI]\d+)/);
  if (!match) throw new Error(`Invalid Tuff value: ${input}`);

  const typeSuffix = match[2]!;
  const range = TUFF_RANGES[typeSuffix];
  if (!range) throw new Error(`Unsupported Tuff type: ${typeSuffix}`);

  const bigValue = BigInt(match[1]!);
  if (bigValue < range.min || bigValue > range.max) {
    throw new Error(
      `Value ${match[1]!} out of range for ${typeSuffix}: ${range.min} to ${range.max}`,
    );
  }

  return Number(bigValue);
}
