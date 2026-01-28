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
    // Reject lowercase 'u' suffixes (invalid usage)
    if (suffix && /^[u]/.test(suffix)) {
      throw new Error('invalid suffix');
    }

    // If there's a suffix, it must be one of the supported forms: U8/U16/U32/U64 or I8/I16/I32/I64
    if (suffix) {
      const m2 = suffix.match(/^([UI])(\d+)$/);
      if (!m2) {
        throw new Error('invalid suffix');
      }
      const kind = m2[1];
      const width = Number(m2[2]);
      const allowedWidths = new Set([8, 16, 32, 64]);
      if (!allowedWidths.has(width)) {
        throw new Error('invalid suffix');
      }

      if (!Number.isInteger(n)) {
        throw new Error(
          kind === 'U' ? 'unsigned literal must be integer' : 'signed literal must be integer'
        );
      }

      if (kind === 'U') {
        if (n < 0) {
          throw new Error('unsigned literal cannot be negative');
        }
        const max = Math.pow(2, width) - 1;
        if (n > max) {
          throw new Error('unsigned literal out of range');
        }
      } else {
        const min = -Math.pow(2, width - 1);
        const max = Math.pow(2, width - 1) - 1;
        if (n < min || n > max) {
          throw new Error('signed literal out of range');
        }
      }
    }

    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
