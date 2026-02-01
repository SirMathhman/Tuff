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

  // Validate a literal value against its type
  function validateLiteral(value: number, suffix: string): void {
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

  // Extract and validate all annotated numbers in the expression
  const validTypes = 'U8|U16|U32|U64|I8|I16|I32|I64';
  const allTypes: Set<string> = new Set();

  // Find all annotated numbers (positive and negative)
  const allPattern = new RegExp('(-?)([0-9]+)(' + validTypes + ')', 'g');
  let match;
  while ((match = allPattern.exec(source)) !== null) {
    const isNegative = match[1] === '-';
    const value = parseInt(match[2], 10);
    const suffix = match[3];
    allTypes.add(suffix);

    // Unsigned types cannot be negative
    if (isNegative && suffix.startsWith('U')) {
      throw new Error(
        'Type annotations are not allowed on negative numeric literals',
      );
    }

    validateLiteral(isNegative ? -value : value, suffix);
  }

  // Remove all type annotations
  const compiled = source
    .replace(new RegExp('([0-9]+)(' + validTypes + ')', 'g'), '$1')
    .replace(new RegExp('-([0-9]+)(' + validTypes + ')', 'g'), '-$1');

  // If there are type annotations, validate the expression result against the type constraints
  if (allTypes.size > 0) {
    // Infer the result type from the types used (assume all same type for now)
    const resultType = Array.from(allTypes)[0];
    const range = typeRanges[resultType];

    // Evaluate the expression
    const fn = new Function('return ' + compiled);
    const result = fn() as number;

    // Check if result fits within the type range
    if (result < range.min || result > range.max) {
      throw new Error(
        resultType +
          ' value must be between ' +
          range.min +
          ' and ' +
          range.max +
          ', got ' +
          result,
      );
    }
  }

  return 'return ' + compiled;
}
