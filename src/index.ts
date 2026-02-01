/**
 * Stubbed function to compile Tuff source to JavaScript.
 *
 * @param source - Tuff source code as a string
 * @returns JavaScript output as a string (stubbed)
 */
export function compileTuffToJS(source: string): string {
  // Handle negative annotated numbers like "-100I8" or "-100U8"
  const negAnnot = source.match(/^-([0-9]+)([A-Za-z][0-9]*)$/);
  if (negAnnot) {
    const value = parseInt(negAnnot[1], 10);
    const suffix = negAnnot[2]; // e.g., 'I8' or 'U8'
    const kind = suffix[0].toUpperCase();
    const width = parseInt(suffix.slice(1), 10);

    if (kind === 'U') {
      // Unsigned types cannot be negative
      throw new Error(
        'Type annotations are not allowed on negative numeric literals',
      );
    }

    if (kind === 'I' && !Number.isNaN(width)) {
      const min = -(2 ** (width - 1));
      const max = 2 ** (width - 1) - 1;
      const actual = -value;
      if (actual < min || actual > max) {
        throw new Error(
          `${suffix} value must be between ${min} and ${max}, got ${actual}`,
        );
      }
    }

    // fall through: allowed negative annotated number
  }

  // Validate U8 values are in range 0-255
  const u8Match = source.match(/([0-9]+)U8/);
  if (u8Match) {
    const value = parseInt(u8Match[1], 10);
    if (value > 255) {
      throw new Error(`U8 value must be between 0 and 255, got ${value}`);
    }
  }

  // Remove type annotations (e.g., "100U8" -> "100")
  const compiled = source.replace(/([0-9]+)[A-Z][0-9]*/g, '$1');
  return `return ${compiled}`;
}
