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

  // helper to validate a value against a suffix kind/width
  function validateValueAgainstSuffix(val: number, kind: 'U' | 'I', width: number) {
    if (!Number.isInteger(val)) {
      throw new Error(
        kind === 'U' ? 'unsigned literal must be integer' : 'signed literal must be integer'
      );
    }
    if (kind === 'U') {
      if (val < 0) throw new Error('unsigned literal cannot be negative');
      const max = Math.pow(2, width) - 1;
      if (val > max) throw new Error('unsigned literal out of range');
    } else {
      const min = -Math.pow(2, width - 1);
      const max = Math.pow(2, width - 1) - 1;
      if (val < min || val > max) throw new Error('signed literal out of range');
    }
  }

  // helper to parse a single literal token and validate suffixes
  // returns { value, suffix } where suffix is undefined or { kind, width }
  function parseLiteralToken(token: string): {
    value: number;
    suffix?: { kind: 'U' | 'I'; width: number };
  } {
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
      const kind = m2[1] as 'U' | 'I';
      const width = Number(m2[2]);
      const allowedWidths = new Set([8, 16, 32, 64]);
      if (!allowedWidths.has(width)) throw new Error('invalid suffix');

      validateValueAgainstSuffix(n, kind, width);

      return { value: Number.isFinite(n) ? n : 0, suffix: { kind, width } };
    }

    return { value: Number.isFinite(n) ? n : 0 };
  }

  // support chained addition: <literal> + <literal> [+ <literal> ...]*
  const parts = s.split(/\s*\+\s*/);
  if (parts.length >= 2) {
    const operands = parts.map((part) => parseLiteralToken(part));
    const sum = operands.reduce((acc, op) => acc + op.value, 0);

    // find the widest suffix among all operands (if any)
    let widestSuffix = operands.find((op) => op.suffix)?.suffix;
    for (const op of operands) {
      if (op.suffix && (!widestSuffix || op.suffix.width > widestSuffix.width)) {
        widestSuffix = op.suffix;
      }
    }

    // validate against the widest type
    if (widestSuffix) {
      validateValueAgainstSuffix(sum, widestSuffix.kind, widestSuffix.width);
    }

    return sum;
  }

  // fallback: single literal — non-numeric inputs return 0 (preserve previous behavior)
  try {
    return parseLiteralToken(s).value;
  } catch (e) {
    if (e instanceof Error && e.message === 'invalid literal') {
      return 0;
    }
    throw e;
  }
}
