export function evaluate(input: string): number {
  const n = Number(input);
  return Number.isFinite(n) ? n : 0;
}
