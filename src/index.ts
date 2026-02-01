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
  const typePattern = new RegExp('(' + validTypes + ')', 'g');
  const numPattern = new RegExp('(-?)([0-9]+)(' + validTypes + ')', 'g');
  const varPattern = new RegExp(
    ':\\s*(' + validTypes + ')\\s*=\\s*(-?)([0-9]+)',
    'g',
  );

  const allTypes = Array.from(source.matchAll(typePattern)).reduce(
    (set, match) => {
      set.add(match[1]);
      return set;
    },
    new Set<string>(),
  );

  Array.from(source.matchAll(numPattern)).forEach((match) => {
    validateAndAddType(
      match[3],
      match[1] === '-',
      parseInt(match[2], 10),
      allTypes,
    );
  });

  Array.from(source.matchAll(varPattern)).forEach((match) => {
    validateAndAddType(
      match[1],
      match[2] === '-',
      parseInt(match[3], 10),
      allTypes,
    );
  });

  return allTypes;
}

// Get the widest type from a set of types
function getWidestType(types: Set<string>): string {
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

  const typeList = Array.from(types);
  if (typeList.length === 0) {
    return '';
  }

  return typeList.reduce((widest, type) => {
    const widestOrder = typeOrder[widest] || 0;
    const order = typeOrder[type] || 0;
    return order > widestOrder ? type : widest;
  }, typeList[0]);
}

// Parse a variable declaration and extract variable name, type, and initializer
function findInitializerEnd(source: string, startIdx: number): number {
  const slice = Array.from(source.slice(startIdx));
  const result = slice.reduce(
    (state, ch, index) => {
      if (state.found) {
        return state;
      }

      const braceDepth =
        state.braceDepth + (ch === '{' ? 1 : ch === '}' ? -1 : 0);
      const parenDepth =
        state.parenDepth + (ch === '(' ? 1 : ch === ')' ? -1 : 0);
      const found = ch === ';' && braceDepth === 0 && parenDepth === 0;

      return {
        braceDepth,
        parenDepth,
        found,
        end: found ? index : -1,
      };
    },
    { braceDepth: 0, parenDepth: 0, found: false, end: -1 },
  );

  return result.found ? startIdx + result.end : -1;
}

// Resolve variable references by tracking declarations and substituting values
function resolveVariableReferences(source: string): string {
  const validTypes = 'U8|U16|U32|U64|I8|I16|I32|I64';
  const declMatch = new RegExp(
    'let\\s+(\\w+)(?:\\s*:\\s*(?:' + validTypes + '))?\\s*=\\s*',
  ).exec(source);

  if (!declMatch) {
    return source;
  }

  const varName = declMatch[1];
  const startIdx = declMatch.index;
  const afterEquals = startIdx + declMatch[0].length;
  const initEnd = findInitializerEnd(source, afterEquals);

  if (initEnd === -1) {
    return source;
  }

  const varInit = source.substring(afterEquals, initEnd).trim();
  const declEnd = initEnd + 1;
  const searchArea = source.substring(declEnd);
  const varRefPattern = new RegExp('\\b' + varName + '\\b');
  const varRefMatch = varRefPattern.exec(searchArea);

  const nextSource = varRefMatch
    ? source.substring(0, startIdx) +
      searchArea.replace(varRefPattern, '(' + varInit + ')')
    : source.substring(0, startIdx) + source.substring(declEnd);

  if (nextSource === source) {
    return source;
  }

  return resolveVariableReferences(nextSource);
}

// Process variable declarations like let x : U8 = 3; x or { let x : U8 = 3; x }
function processVariableDeclarations(source: string): string {
  const validTypes = 'U8|U16|U32|U64|I8|I16|I32|I64';
  const resolved = resolveVariableReferences(source);
  const stabilized =
    resolved === source ? resolved : processVariableDeclarations(resolved);

  const bracedPattern = new RegExp(
    '\\{\\s*let\\s+(\\w+)(?:\\s*:\\s*(?:' +
      validTypes +
      '))?\\s*=\\s*([^;]+);\\s*\\1\\s*\\}',
    'g',
  );
  return stabilized.replace(bracedPattern, '($2)');
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
  Array.from(content.matchAll(letPattern)).reduce((seen, match) => {
    const id = match[1];
    if (seen.has(id)) {
      throw new Error("Redeclaration of variable '" + id + "'");
    }
    seen.add(id);
    return seen;
  }, new Set<string>());
}

// Check for variable redeclarations across all scopes
function checkRedeclarations(source: string): void {
  const innerBlockMatch = source.match(/\{([^{}]*)\}/);
  if (innerBlockMatch) {
    validateNoDuplicates(innerBlockMatch[1]);
    const nextSource = source.replace(/\{[^{}]*\}/, '');
    checkRedeclarations(nextSource);
    return;
  }
  validateNoDuplicates(source);
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
