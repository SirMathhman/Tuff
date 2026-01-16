export function interpret(input: string): number {
  // Remove type suffix (e.g., "U8", "I32", etc.)
  const numberPart = input.replace(/[UI]\d+$/, '');
  return Number.parseInt(numberPart, 10);
}
