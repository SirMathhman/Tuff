export function evaluate(input: string): number {
  if (input === "") return 0;
  const num = Number(input);
  if (!Number.isNaN(num)) return num;
  throw new Error("Not implemented");
}
