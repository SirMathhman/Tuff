export function tokenize(input: string): string[] {
  return input
    .split(/(\+|-|\*|\/|\(|\)|\{|\}|=|;|let)/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}
