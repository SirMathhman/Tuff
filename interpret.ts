export function interpret(input: string): number {  // Check for negative numbers with type suffixes
  if (/^-.*[A-Z]\d+$/.test(input)) {
    throw new Error(`Invalid literal: negative numbers cannot have type suffixes`);
  }
    // Remove type suffixes (e.g., U8, I32, etc.)
  const stripped = input.replace(/[A-Z]\d+$/, "");
  return parseInt(stripped, 10);
}
