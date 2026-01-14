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
  return n;
}
