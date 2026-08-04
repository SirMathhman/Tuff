export function evaluate(source: string): number {
  if (source.trim() === "") {
    return 0;
  }
  return Number(source);
}
