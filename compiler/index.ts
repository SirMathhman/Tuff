export function executeTuff(tuffSourceCode: string): number | bigint {
  if (tuffSourceCode === "") {
    return 0;
  }
  if (/^-\d+/.test(tuffSourceCode)) {
    throw new Error("Negative values are not supported");
  }

  const match = tuffSourceCode.match(/^(\d+)U(8|16|32|64)$/);
  if (!match || !match[1] || !match[2]) {
    throw new Error("Invalid format");
  }

  const valueStr = match[1];
  const bits = parseInt(match[2], 10);
  const maxValue = (1n << BigInt(bits)) - 1n;
  const value = BigInt(valueStr);

  if (value > maxValue) {
    throw new Error(`Value exceeds maximum for U${bits}`);
  }

  // If the value fits within a safe integer range, return as number. Otherwise, return bigint.
  if (value <= Number.MAX_SAFE_INTEGER && bits !== 64) {
    return Number(value);
  }

  return value;
}

