/**
 * Stubbed function to compile Tuff source to JavaScript.
 *
 * @param source - Tuff source code as a string
 * @returns JavaScript output as a string (stubbed)
 */
export function compileTuffToJS(source: string): string {
  // Valid integer type suffixes with their ranges
  const typeRanges: Record<string, { min: number; max: number }> = {
    U8: { min: 0, max: 2 ** 8 - 1 },
    U16: { min: 0, max: 2 ** 16 - 1 },
    U32: { min: 0, max: 2 ** 32 - 1 },
    U64: { min: 0, max: 2 ** 64 - 1 },
    I8: { min: -(2 ** 7), max: 2 ** 7 - 1 },
    I16: { min: -(2 ** 15), max: 2 ** 15 - 1 },
    I32: { min: -(2 ** 31), max: 2 ** 31 - 1 },
    I64: { min: -(2 ** 63), max: 2 ** 63 - 1 },
  };

  // Check for positive annotated number: "100U8", "50I16", etc.
  const posAnnot = source.match(/^([0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64)$/);
  if (posAnnot) {
    const value = parseInt(posAnnot[1], 10);
    const suffix = posAnnot[2];
    const range = typeRanges[suffix];
    if (value < range.min || value > range.max) {
      throw new Error(
        suffix +
          ' value must be between ' +
          range.min +
          ' and ' +
          range.max +
          ', got ' +
          value,
      );
    }
    return 'return ' + value;
  }

  // Check for negative annotated number: "-100I8", "-50I16", etc.
  const negAnnot = source.match(/^-([0-9]+)(U8|U16|U32|U64|I8|I16|I32|I64)$/);
  if (negAnnot) {
    const value = parseInt(negAnnot[1], 10);
    const suffix = negAnnot[2];
    const actual = -value;
    const range = typeRanges[suffix];

    // Unsigned types cannot be negative
    if (suffix.startsWith('U')) {
      throw new Error(
        'Type annotations are not allowed on negative numeric literals',
      );
    }

    if (actual < range.min || actual > range.max) {
      throw new Error(
        suffix +
          ' value must be between ' +
          range.min +
          ' and ' +
          range.max +
          ', got ' +
          actual,
      );
    }
    return 'return ' + actual;
  }

  // No valid type annotation found; return as-is
  return 'return ' + source;
}
