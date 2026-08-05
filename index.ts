export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === "") return 0;
  const parts = trimmed.split("+");
  return parts.reduce((sum, part) => sum + parseFloat(part.trim()), 0);
}
