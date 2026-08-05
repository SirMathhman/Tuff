export function evaluate(source: string): number {
  if (!source.trim()) return 0;
  return source.split("+").reduce((sum, part) => sum + parseInt(part.trim(), 10), 0);
}
