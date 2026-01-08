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

    // If there's a trailing suffix, try to interpret it.
    if (rest.length > 0) {
      const suf = rest.match(/^([uUiI])(\d+)$/);
      if (suf) {
        const kind = suf[1];
        const bits = Number(suf[2]);
        // Suffix requires integer value (no decimal part)
        if (!/^[-+]?\d+$/.test(leading)) {
          throw new Error("suffix requires integer value");
        }
        const valueBig = BigInt(leading);
        if (kind === "u" || kind === "U") {
          // Unsigned: value must be >= 0 and <= 2^bits - 1
          if (valueBig < 0n)
            throw new Error("negative numbers with suffixes are not allowed");
          const max = (1n << BigInt(bits)) - 1n;
          if (valueBig > max)
            throw new Error(`value out of range for U${bits}`);
          return Number(valueBig);
        } else {
          // Signed: value must be within -(2^(bits-1)) .. 2^(bits-1)-1
          const min = -(1n << BigInt(bits - 1));
          const max = (1n << BigInt(bits - 1)) - 1n;
          if (valueBig < min || valueBig > max)
            throw new Error(`value out of range for I${bits}`);
          return Number(valueBig);
        }
      }

      // If there's a non-recognized suffix and the number is negative, reject it.
      if (leading.startsWith("-")) {
        throw new Error("negative numbers with suffixes are not allowed");
      }
    }

    return Number(leading);
  }
  return 0;
}
