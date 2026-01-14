export function interpret(input: string): number {
  const s = input.trim();
  const match = s.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
  if (!match) {
    throw new Error("Invalid number");
  }
  const numStr = match[0];
  const n = parseFloat(numStr);
  if (Number.isNaN(n)) {
    throw new Error("Invalid number");
  }

  const rest = s.slice(numStr.length);
  if (rest.length === 0) {
    return n;
  }

  // Match suffix like U8, U16, U32, U64, I8, I16, I32, I64 (case-insensitive)
  const sufMatch = rest.match(/^([uUiI])(8|16|32|64)(.*)$/);
  if (!sufMatch) {
    // If there's a suffix but it's not one we recognize, just return the numeric prefix
    return n;
  }

  const sign = sufMatch[1].toUpperCase();
  const bits = parseInt(sufMatch[2], 10);
  // For simplicity require integer for integer suffixes
  if (!/^[-+]?\d+$/.test(numStr)) {
    throw new Error("Integer required for integer type suffix");
  }

  const intVal = Number(numStr);
  // Define ranges
  const ranges: Record<string, { min: bigint; max: bigint }> = {
    U8: { min: 0n, max: 255n },
    U16: { min: 0n, max: 65535n },
    U32: { min: 0n, max: 4294967295n },
    U64: { min: 0n, max: 18446744073709551615n },
    I8: { min: -128n, max: 127n },
    I16: { min: -32768n, max: 32767n },
    I32: { min: -2147483648n, max: 2147483647n },
    I64: { min: -9223372036854775808n, max: 9223372036854775807n },
  };

  const key = `${sign}${bits}`;
  const range = ranges[key];
  if (!range) {
    // Unknown suffix, return numeric prefix
    return n;
  }

  // Use BigInt for range checks to avoid precision issues
  const big = BigInt(intVal);
  if (big < range.min || big > range.max) {
    throw new Error(`${key} out of range`);
  }

  // For 64-bit values that might be outside JS safe integers, disallow values that exceed Number.MAX_SAFE_INTEGER
  if (
    bits === 64 &&
    (big > BigInt(Number.MAX_SAFE_INTEGER) ||
      big < BigInt(Number.MIN_SAFE_INTEGER))
  ) {
    throw new Error(`${key} value not representable as a JavaScript number`);
  }

  return Number(intVal);
}
