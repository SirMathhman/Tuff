export function interpret(input: string): number {
  if (input === "") return 0;
  return input.split("+").map(s => Number(s.trim())).reduce((a, b) => a + b, 0);
}

console.log("Hello via Bun!");
