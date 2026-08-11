export function interpret(input: string): number {
  if (input === "") return 0;
  const parsed = Number(input);
  if (!Number.isNaN(parsed)) return parsed;
  throw new Error(`Not implemented for: ${input}`);
}
