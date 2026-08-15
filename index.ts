export function evaluate(input: string): number {
  if (input === "") return 0;
  const n = Number(input);
  if (Number.isNaN(n)) throw new Error(`Unsupported input: ${input}`);
  return n;
}
