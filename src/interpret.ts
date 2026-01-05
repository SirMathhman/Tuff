export function interpret(input: string): number {
  const trimmed = input.trim();

  // Direct numeric string
  const n = Number(trimmed);
  if (Number.isFinite(n)) {
    return n;
  }

  // Allow simple arithmetic expressions consisting of digits, operators, dots, parentheses and whitespace
  if (/^[0-9+\-*/().\s]+$/.test(trimmed)) {
    try {
      // Use Function to evaluate within a restricted scope; validate result is a finite number
      const result = Function(`'use strict'; return (${trimmed});`)();
      if (typeof result === 'number' && Number.isFinite(result)) {
        return result;
      }
    } catch (e) {
      // fall through to throw below
    }
  }

  throw new Error('interpret: input is not a number or valid expression');
}
