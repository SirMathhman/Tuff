export function evaluate(input: string): number {
  if (input === "") return 0;
  throw new Error(`evaluate: unsupported input "${input}"`);
}

console.log("Hello via Bun!");