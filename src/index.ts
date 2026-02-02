export function interpret(source: string): number {
  if (source === "") {
    return 0;
  }
  // Match numeric literal with optional type suffix (e.g., "100" or "100U8")
  const match = source.match(/^(\d+)/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return parseInt(source, 10);
}
