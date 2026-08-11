export function evaluate(source: string): number {
  if (source === "") return 0;
  const parts = source.split("+");
  if (parts.length === 1) {
    const num = Number(parts[0]!);
    if (parts[0]!.trim() === String(num)) return num;
    throw new Error("Invalid source: " + source);
  }
  const result = parts.map(p => Number(p.trim())).reduce((a, b) => a + b, 0);
  return result;
}
