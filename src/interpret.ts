/**
 * Interpret a string and return a number.
 * Minimal rules for now:
 * - empty or whitespace-only -> 0
 * - numeric literal (integer or float) -> parsed number
 * - bare identifier (letters, digits, underscores, not starting with digit) -> throw Undefined identifier error
 * - otherwise -> throw generic interpretation error
 */
export function interpret(input: string): number {
  const s = input.trim();
  if (s === '') return 0;

  // numeric literal (integer or decimal)
  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    return Number(s);
  }

  // identifier (e.g., wah, foo_bar)
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) {
    throw new Error(`Undefined identifier: ${s}`);
  }

  throw new Error('Unable to interpret input');
}
