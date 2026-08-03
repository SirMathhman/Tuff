export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") {
    return 0;
  }
  return trimmed
    .split("+")
    .map((part) => Number(part.trim()))
    .reduce((sum, value) => sum + value, 0);
}
