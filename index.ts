export function interpret(input: string): number {
  if (input === "") return 0;
  const parts = input
    .split(/(\+|-)/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const result = [Number(parts[0])];
  for (let i = 1; i < parts.length; i += 2) {
    const op = parts[i];
    const num = Number(parts[i + 1]);
    result.push(op === "+" ? num : -num);
  }
  return result.reduce((a, b) => a + b, 0);
}

console.log("Hello via Bun!");
