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
  // Disallow unsigned suffix 'U' for any numbers (e.g., "256U8" or "-100U8")
  if (rest.length > 0 && /^[uU]/.test(rest)) {
    throw new Error("Unsigned suffix 'U' is invalid");
  }
  return n;
}
