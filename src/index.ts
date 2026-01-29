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

  // helper to parse a single literal token and validate suffixes
  function parseLiteralToken(token: string): number {
    const t = token.trim();
    const m = t.match(/^([+-]?\d+(?:\.\d+)?)(?:([A-Za-z]+\d*))?$/);
    if (!m) throw new Error('invalid literal');
    const n = Number(m[1]);
    const suffix = m[2];

    if (suffix && /^[u]/.test(suffix)) {
      throw new Error('invalid suffix');
    }

    if (suffix) {
      const m2 = suffix.match(/^([UI])(\d+)$/);
      if (!m2) throw new Error('invalid suffix');
      const kind = m2[1];
      const width = Number(m2[2]);
      const allowedWidths = new Set([8, 16, 32, 64]);
      if (!allowedWidths.has(width)) throw new Error('invalid suffix');

      if (!Number.isInteger(n)) {
        throw new Error(
          kind === 'U' ? 'unsigned literal must be integer' : 'signed literal must be integer'
        );
      }

      if (kind === 'U') {
        if (n < 0) throw new Error('unsigned literal cannot be negative');
        const max = Math.pow(2, width) - 1;
        if (n > max) throw new Error('unsigned literal out of range');
      } else {
        const min = -Math.pow(2, width - 1);
        const max = Math.pow(2, width - 1) - 1;
        if (n < min || n > max) throw new Error('signed literal out of range');
      }
    }

    return Number.isFinite(n) ? n : 0;
  }

  // support simple addition: <literal> + <literal>
  const parts = s.split(/\s*\+\s*/);
  if (parts.length === 2) {
    const a = parseLiteralToken(parts[0]);
    const b = parseLiteralToken(parts[1]);
    return a + b;
  }

  // fallback: single literal — non-numeric inputs return 0 (preserve previous behavior)
  try {
    return parseLiteralToken(s);
  } catch (e) {
    if (e instanceof Error && e.message === 'invalid literal') {
      return 0;
    }
    throw e;
  }
}
