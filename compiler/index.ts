export function executeTuff(tuffSourceCode: string): number {
  if (tuffSourceCode === "") {
    return 0;
  }
  if (/^-\d+/.test(tuffSourceCode)) {
    throw new Error("Negative values are not supported");
  }
  const match = tuffSourceCode.match(/^(\d+)U(\d+)/);
  if (!match || !match[1] || !match[2]) {
    throw new Error("Invalid format");
  }

  const value = parseInt(match[1], 10);
  const bits = parseInt(match[2], 10);
  const maxValue = (1 << bits) - 1;

  if (value > maxValue) {
    throw new Error(`Value exceeds maximum for U${bits}`);
  }

  return value;
}
