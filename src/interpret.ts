/**
 * Interpret function.
 * - If the input starts with a numeric value (integer or float), returns that numeric value.
 * - Otherwise returns 0.
 * This allows inputs with type suffixes like `100U8` to be parsed as 100.
 */
export function interpret(input: string): number {
  const s = input.trim();
  // Match a leading optional sign and number (integer or float). If present, parse it.
  const m = s.match(/^[+-]?(\d+(?:\.\d+)?)/);
  if (m) {
    const leading = m[0];
    const rest = s.slice(leading.length).trim();

    // If there's a trailing suffix and the number is negative, consider it invalid.
    if (rest.length > 0 && leading.startsWith("-")) {
      throw new Error("negative numbers with suffixes are not allowed");
    }

    // Handle unsigned integer suffixes like U8: require integer and range check.
    const uMatch = rest.match(/^([uU])(\d+)$/);
    if (uMatch) {
      const bits = Number(uMatch[2]);
      const max = 2 ** bits - 1;
      const value = Number(leading);
      // Must be integer and within 0..max
      if (!Number.isInteger(value) || value < 0 || value > max) {
        throw new Error(`value out of range for U${bits}`);
      }
      return value;
    }

    return Number(leading);
  }
  return 0;
}
