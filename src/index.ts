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

  // Extract and validate all annotated numbers in the expression
  const validTypes = 'U8|U16|U32|U64|I8|I16|I32|I64';
  
  // Find all positive annotated numbers
  const posPattern = new RegExp('([0-9]+)(' + validTypes + ')', 'g');
  let match;
  while ((match = posPattern.exec(source)) !== null) {
    const value = parseInt(match[1], 10);
    const suffix = match[2];
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
  }

  // Find all negative annotated numbers
  const negPattern = new RegExp('-([0-9]+)(' + validTypes + ')', 'g');
  while ((match = negPattern.exec(source)) !== null) {
    const value = parseInt(match[1], 10);
    const suffix = match[2];
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
  }

  // Remove all type annotations
  const compiled = source
    .replace(new RegExp('([0-9]+)(' + validTypes + ')', 'g'), '$1')
    .replace(new RegExp('-([0-9]+)(' + validTypes + ')', 'g'), '-$1');

  return 'return ' + compiled;
}
