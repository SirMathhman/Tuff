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

  const typePattern = new RegExp('(' + validTypes + ')', 'g');
  let match;
  let iterations = 0;
  const maxIterations = 10000;

  while (
    (match = typePattern.exec(source)) !== null &&
    iterations < maxIterations
  ) {
    iterations = iterations + 1;
    allTypes.add(match[1]);
  }

  const numPattern = new RegExp('(-?)([0-9]+)(' + validTypes + ')', 'g');
  iterations = 0;
  while (
    (match = numPattern.exec(source)) !== null &&
    iterations < maxIterations
  ) {
    iterations = iterations + 1;
    validateAndAddType(
      match[3],
      match[1] === '-',
      parseInt(match[2], 10),
      allTypes,
    );
  }

  const varPattern = new RegExp(
    ':\\s*(' + validTypes + ')\\s*=\\s*(-?)([0-9]+)',
    'g',
  );
  iterations = 0;
  while (
    (match = varPattern.exec(source)) !== null &&
    iterations < maxIterations
  ) {
    iterations = iterations + 1;
    validateAndAddType(
      match[1],
      match[2] === '-',
      parseInt(match[3], 10),
      allTypes,
    );
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

  let iterations = 0;
  const maxIterations = 10000;
  for (const type of types) {
    iterations = iterations + 1;
    if (iterations > maxIterations) {
      break;
    }
    const order = typeOrder[type] || 0;
    if (order > widestOrder) {
      widest = type;
      widestOrder = order;
    }
  }

  return widest;
}

// Parse a variable declaration and extract variable name, type, and initializer
function findInitializerEnd(source: string, startIdx: number): number {
  let braceDepth = 0;
  let parenDepth = 0;

  let iterations = 0;
  const maxIterations = 10000;
  for (
    let i = startIdx;
    i < source.length && iterations < maxIterations;
    i = i + 1
  ) {
    iterations = iterations + 1;
    const ch = source[i];
    if (ch === '{') {
      braceDepth = braceDepth + 1;
    } else if (ch === '}') {
      braceDepth = braceDepth - 1;
    } else if (ch === '(') {
      parenDepth = parenDepth + 1;
    } else if (ch === ')') {
      parenDepth = parenDepth - 1;
    } else if (ch === ';' && braceDepth === 0 && parenDepth === 0) {
      return i;
    }
  }

  return -1;
}

// Resolve variable references by tracking declarations and substituting values
function resolveVariableReferences(source: string): string {
  const validTypes = 'U8|U16|U32|U64|I8|I16|I32|I64';

  let processed = source;
  let changed = true;
  let iterations = 0;
  const maxIterations = 1000;

  while (changed && iterations < maxIterations) {
    iterations = iterations + 1;
    changed = false;

    const declMatch = new RegExp(
      'let\\s+(\\w+)(?:\\s*:\\s*(?:' + validTypes + '))?\\s*=\\s*',
    ).exec(processed);

    if (!declMatch) {
      break;
    }

    const varName = declMatch[1];
    const startIdx = declMatch.index;
    const afterEquals = startIdx + declMatch[0].length;
    const initEnd = findInitializerEnd(processed, afterEquals);

    if (initEnd === -1) {
      break;
    }

    const varInit = processed.substring(afterEquals, initEnd).trim();
    const declEnd = initEnd + 1;

    const searchArea = processed.substring(declEnd);
    const varRefPattern = new RegExp('\\b' + varName + '\\b');
    const varRefMatch = varRefPattern.exec(searchArea);

    if (varRefMatch) {
      processed =
        processed.substring(0, startIdx) +
        searchArea.replace(varRefPattern, '(' + varInit + ')');
      changed = true;
    } else {
      processed =
        processed.substring(0, startIdx) + processed.substring(declEnd);
      changed = true;
    }
  }

  return processed;
}

// Process variable declarations like let x : U8 = 3; x or { let x : U8 = 3; x }
function processVariableDeclarations(source: string): string {
  const validTypes = 'U8|U16|U32|U64|I8|I16|I32|I64';
  let processed = source;
  let last;
  let iterations = 0;
  const maxIterations = 1000;

  do {
    iterations = iterations + 1;
    if (iterations > maxIterations) {
      break;
    }

    last = processed;
    processed = resolveVariableReferences(processed);
  } while (processed !== last);

  const bracedPattern = new RegExp(
    '\\{\\s*let\\s+(\\w+)(?:\\s*:\\s*(?:' +
      validTypes +
      '))?\\s*=\\s*([^;]+);\\s*\\1\\s*\\}',
    'g',
  );
  processed = processed.replace(bracedPattern, '($2)');

  return processed;
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

// Ensure no variable is redeclared in the same scope
function validateNoDuplicates(content: string): void {
  const letPattern = /let\s+([a-zA-Z_]\w*)/g;
  const seen = new Set<string>();
  let match;
  let iterations = 0;
  const maxIterations = 10000;

  while (
    (match = letPattern.exec(content)) !== null &&
    iterations < maxIterations
  ) {
    iterations = iterations + 1;
    const id = match[1];
    if (seen.has(id)) {
      throw new Error("Redeclaration of variable '" + id + "'");
    }
    seen.add(id);
  }
}

// Check for variable redeclarations across all scopes
function checkRedeclarations(source: string): void {
  let current = source;
  let iterations = 0;
  const maxIterations = 1000;

  while (current.includes('{') && iterations < maxIterations) {
    iterations = iterations + 1;
    const innerBlockMatch = current.match(/\{([^{}]*)\}/);
    if (!innerBlockMatch) {
      break;
    }
    validateNoDuplicates(innerBlockMatch[1]);
    current = current.replace(/\{[^{}]*\}/, '');
  }
  validateNoDuplicates(current);
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
  checkRedeclarations(source);
  const allTypes = extractAndValidateAnnotations(source);
  let compiled = processVariableDeclarations(source);
  compiled = removeTypeAnnotations(compiled);
  compiled = removeCurlyBraces(compiled);
  validateExpressionResult(compiled, allTypes);
  return 'return ' + compiled;
}
