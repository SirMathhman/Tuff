export function interpret(input: string): number {
  const trimmed = input.trim();

  // Direct numeric literal
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && trimmed !== '') {
    return numeric;
  }

  // Support simple addition: e.g., "1 + 2" or "1+2+3"
  if (trimmed.includes('+')) {
    return trimmed
      .split('+')
      .map((part) => interpret(part.trim()))
      .reduce((acc, v) => acc + v, 0);
  }

  throw new Error('Invalid numeric input');
}
