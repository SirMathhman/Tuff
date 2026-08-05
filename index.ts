export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (trimmed === '') return 0;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}
