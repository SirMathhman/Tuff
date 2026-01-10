export function interpret(input: string): number {
  // Remove type suffixes (e.g., U8, I32, etc.)
  const stripped = input.replace(/[A-Z]\d+$/, '');
  return parseInt(stripped, 10);
}
