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
    const rest = s.slice(leading.length);
    // If there's a trailing suffix and the number is negative, consider it invalid.
    if (rest.length > 0 && leading.startsWith("-")) {
      throw new Error("negative numbers with suffixes are not allowed");
    }
    return Number(leading);
  }
  return 0;
}
