export function executeTuff(tuffSourceCode: string): number | bigint {
  if (tuffSourceCode === "") {
    return 0;
  }

  const match = tuffSourceCode.match(/^(-?\d+)([UI])(8|16|32|64)$/);
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
