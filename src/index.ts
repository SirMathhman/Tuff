export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Interpret the given input string and produce a numeric result.
 * This function supports numeric literals (integers and decimals), optionally
 * followed by a type suffix such as `U8` (unsigned 8-bit). Examples:
 * - Empty input returns 0
 * - Numeric input (e.g., "100", "-3.14") returns that numeric value
 * - Numeric with suffix (e.g., "100U8") returns the numeric value, ignoring the suffix
 * - Otherwise returns 0 (stub behavior)
 */
export function interpret(input: string): number {
  const s = input.trim();
  if (s === '') return 0;
  // match a numeric prefix (integer or decimal) and capture an optional alphabetic suffix + optional digits
  const m = s.match(/^([+-]?\d+(?:\.\d+)?)(?:([A-Za-z]+\d*))?$/);
  if (m) {
    const n = Number(m[1]);
    const suffix = m[2];
    // If there's an unsigned suffix (starts with U or u), negative values are invalid
    if (suffix && /^[Uu]/.test(suffix) && n < 0) {
      throw new Error('unsigned literal cannot be negative');
    }
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
