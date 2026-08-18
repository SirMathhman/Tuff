export function evaluate(input: string): number {
  if (input === "") return 0;
  const trimmed = input.trim();
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  throw new Error(`evaluate: unsupported input "${input}"`);
}