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
  if (s === "") return 0;

  // numeric literal (integer or decimal)
  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    return Number(s);
  }

  // simple addition/subtraction via normalizing '-' to '+-' and summing operands
  if (s.includes("+") || s.includes("-")) {
    // normalize subtraction into addition of negative numbers, preserving signs
    const normalized = s.replace(/\s*-\s*/g, "+-").replace(/\s+/g, "");
    const parts = normalized.split("+").map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length >= 2) {
      const numRe = /^-?\d+(?:\.\d+)?$/;
      if (parts.every((p) => numRe.test(p))) {
        return parts.reduce((acc, p) => acc + Number(p), 0);
      }
    }
    // fall through to error if it doesn't match the simple pattern
  }

  // identifier (e.g., wah, foo_bar)
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) {
    throw new Error(`Undefined identifier: ${s}`);
  }

  throw new Error("Unable to interpret input");
}
