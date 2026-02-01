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

// Validate and add a type annotation to the set
function validateAndAddType(
  suffix: string,
  isNegative: boolean,
  value: number,
  allTypes: Set<string>,
): void {
  allTypes.add(suffix);

  if (isNegative && suffix.startsWith('U')) {
    throw new Error(
      'Type annotations are not allowed on negative numeric literals',
    );
  }

  validateLiteral(isNegative ? -value : value, suffix);
}

// Extract and validate all annotated numbers in the source expression
function extractAndValidateAnnotations(source: string): Set<string> {
  const validTypes = 'U8|U16|U32|U64|I8|I16|I32|I64';
  const allTypes: Set<string> = new Set();

  const allPattern = new RegExp('(-?)([0-9]+)(' + validTypes + ')', 'g');
  let match;
  while ((match = allPattern.exec(source)) !== null) {
    const isNegative = match[1] === '-';
    const value = parseInt(match[2], 10);
    const suffix = match[3];
    validateAndAddType(suffix, isNegative, value, allTypes);
  }

  const varPattern = new RegExp(
    ':\\s*(' + validTypes + ')\\s*=\\s*(-?)([0-9]+)',
    'g',
  );
  while ((match = varPattern.exec(source)) !== null) {
    const suffix = match[1];
    const isNegative = match[2] === '-';
    const value = parseInt(match[3], 10);
    validateAndAddType(suffix, isNegative, value, allTypes);
  }

  return allTypes;
}

// Get the widest type from a set of types
function getWidestType(types: Set<string>): string {
  if (types.size === 0) {
    return '';
  }

  const typeOrder: Record<string, number> = {
    U8: 1,
    U16: 2,
    U32: 3,
    U64: 4,
    I8: 5,
    I16: 6,
    I32: 7,
    I64: 8,
  };

  let widest = Array.from(types)[0];
  let widestOrder = typeOrder[widest] || 0;

  for (const type of types) {
    const order = typeOrder[type] || 0;
    if (order > widestOrder) {
      widest = type;
      widestOrder = order;
    }
  }

  return widest;
}

// Process block expressions like { let x : U8 = 3; x } to (3)
function processBlockExpressions(source: string): string {
  const validTypes = 'U8|U16|U32|U64|I8|I16|I32|I64';
  const blockPattern = new RegExp(
    '\\{\\s*let\\s+(\\w+)\\s*:\\s*(' +
      validTypes +
      ')\\s*=\\s*([^;]+);\\s*\\1\\s*\\}',
    'g',
  );
  return source.replace(blockPattern, '($3)');
}

// Remove all type annotations from the source expression
function removeTypeAnnotations(source: string): string {
  const validTypes = 'U8|U16|U32|U64|I8|I16|I32|I64';
  return source
    .replace(new RegExp('([0-9]+)(' + validTypes + ')', 'g'), '$1')
    .replace(new RegExp('-([0-9]+)(' + validTypes + ')', 'g'), '-$1')
    .replace(new RegExp(':\\s*(' + validTypes + ')', 'g'), '');
}

// Remove curly braces from the source expression
function removeCurlyBraces(source: string): string {
  return source.replace(/[{}]/g, '');
}

// Validate the compiled expression result against type constraints
function validateExpressionResult(
  compiled: string,
  allTypes: Set<string>,
): void {
  if (allTypes.size === 0) {
    return;
  }

  const resultType = getWidestType(allTypes);
  const range = typeRanges[resultType];

  const fn = new Function('return ' + compiled);
  const result = fn() as number;

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

/**
 * Stubbed function to compile Tuff source to JavaScript.
 *
 * @param source - Tuff source code as a string
 * @returns JavaScript output as a string (stubbed)
 */
export function compileTuffToJS(source: string): string {
  const allTypes = extractAndValidateAnnotations(source);
  let compiled = processBlockExpressions(source);
  compiled = removeTypeAnnotations(compiled);
  compiled = removeCurlyBraces(compiled);
  validateExpressionResult(compiled, allTypes);
  return 'return ' + compiled;
}
