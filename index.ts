export function evaluate(source: string): number {
  const trimmed = source.trim();
  if (!trimmed) return 0;

  // Try simple addition first (e.g. "1 + 2")
  const parts = trimmed.split("+");
  if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
    const left = Number(parts[0].trim());
    const right = Number(parts[1].trim());
    if (!isNaN(left) && !isNaN(right)) return left + right;
  }

  // Fall back to plain number
  return Number(trimmed);
}
