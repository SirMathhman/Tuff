export function evaluate(input: string): number {
  if (input === "") return 0;
  const n = Number(input);
  if (Number.isFinite(n)) return n;
  throw new Error("not implemented");
}
