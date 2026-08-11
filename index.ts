export function evaluate(source: string): number {
  if (source === "") return 0;
  const num = Number(source);
  if (source.trim() === String(num)) return num;
  throw new Error("Invalid source: " + source);
}
