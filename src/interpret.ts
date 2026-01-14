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
  // Disallow negative numbers with unsigned suffix 'U' (e.g., "-100U8")
  if (rest.length > 0 && /^[uU]/.test(rest) && n < 0) {
    throw new Error("Negative number with unsigned suffix is invalid");
  }
  return n;
}
