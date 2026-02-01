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

// Type ordering by width (U8=1 to I64=8)
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

// Extract the inferred type of a variable from its initializer
function getVariableType(initializer: string): string {
  const validTypes = 'U8|U16|U32|U64|I8|I16|I32|I64';
  const typeMatch = new RegExp('(\\d+)(' + validTypes + ')\\b').exec(
    initializer,
  );
  return typeMatch ? typeMatch[2] : '';
}

// Check if sourceType can be assigned to targetType
function isTypeCompatible(sourceType: string, targetType: string): boolean {
  const sourceOrder = typeOrder[sourceType] || 0;
  const targetOrder = typeOrder[targetType] || 0;
  return sourceOrder === 0 || sourceOrder <= targetOrder;
}

// Resolve variable references by tracking declarations and substituting values
function resolveVariableReferences(source: string): string {
  const validTypes = 'U8|U16|U32|U64|I8|I16|I32|I64';
  const declMatch = new RegExp(
    'let\\s+(\\w+)(?:\\s*:\\s*(' + validTypes + '))?\\s*=\\s*',
  ).exec(source);

  if (!declMatch) {
    return source;
  }

  const varName = declMatch[1];
  const targetType = declMatch[2] || '';
  const startIdx = declMatch.index;
  const afterEquals = startIdx + declMatch[0].length;
  const initEnd = findInitializerEnd(source, afterEquals);

  if (initEnd === -1) {
    return source;
  }

  const varInit = source.substring(afterEquals, initEnd).trim();
  const sourceType = getVariableType(varInit);

  if (targetType && sourceType && !isTypeCompatible(sourceType, targetType)) {
    throw new Error(
      'Cannot assign ' +
        sourceType +
        ' to ' +
        targetType +
        " variable '" +
        varName +
        "'",
    );
  }

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

// Remove curly braces from the source expression (preserving function bodies)
function removeCurlyBraces(source: string): string {
  // If the source contains a function declaration (for mutations), don't remove its braces
  if (/\(function\(\)/.test(source)) {
    return source;
  }
  return source.replace(/[{}]/g, '');
}

// Ensure no variable is redeclared in the same scope
function validateNoDuplicates(content: string): void {
  const letPattern = /let\s+(?:mut\s+)?([a-zA-Z_]\w*)/g;
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

// Process mutable variable declarations and reassignments
function processMutableVariables(source: string): string {
  const hasMut = /let\s+mut\s+/.test(source);
  const hasReassignment = /\b([a-zA-Z_]\w*)\s*=\s*[^;=]/.test(
    source.replace(/let\s+(?:mut\s+)?\w+\s*(?::\s*\w+)?\s*=/g, ''),
  );

  if (!hasMut && !hasReassignment) {
    return source;
  }

  // Replace let mut with let
  let transformed = source.replace(/let\s+mut\s+/g, 'let ');

  // Extract the final return value (last standalone identifier)
  const lastIdMatch = transformed.match(/;\s*([a-zA-Z_]\w*)\s*$/);
  const returnVar = lastIdMatch ? lastIdMatch[1] : '';

  if (!returnVar) {
    return transformed;
  }

  // Remove the trailing variable reference
  const withoutTrailing = transformed.replace(/;\s*[a-zA-Z_]\w*\s*$/, ';');

  // Wrap in IIFE for mutation support
  const wrapped =
    '(function() { ' + withoutTrailing + ' return ' + returnVar + '; })()';
  return wrapped;
}

// Validate that reassignments only occur on mutable variables
function validateImmutability(source: string): void {
  // Extract all variable declarations and whether they're mutable
  const validTypes = 'U8|U16|U32|U64|I8|I16|I32|I64';
  const declPattern = new RegExp(
    'let\\s+(mut\\s+)?(\\w+)(?:\\s*:\\s*(?:' + validTypes + '))?\\s*=',
    'g',
  );

  const mutableVars = new Set<string>();
  const declaredVars = new Set<string>();

  Array.from(source.matchAll(declPattern)).forEach((match) => {
    const isMutable = match[1] === 'mut ';
    const varName = match[2];
    declaredVars.add(varName);
    if (isMutable) {
      mutableVars.add(varName);
    }
  });

  // Find reassignments - look for variable assignments that aren't type annotations
  // Type annotations look like: varname : Type = value
  // Reassignments look like: varname = value (without the colon and type)
  const typeAnnotPattern = /:\s*(?:U8|U16|U32|U64|I8|I16|I32|I64)\s*/;
  const reassignPattern = /\b([a-zA-Z_]\w*)\s*=\s*[^;=]/g;

  Array.from(source.matchAll(reassignPattern)).forEach((match) => {
    const varName = match[1];
    const matchStart = match.index ?? 0;
    const beforeMatch = source.substring(
      Math.max(0, matchStart - 50),
      matchStart,
    );

    // Skip if this is a type annotation (preceded by : Type)
    if (typeAnnotPattern.test(beforeMatch)) {
      return;
    }

    // Skip if this is part of a let declaration
    if (/let\s+(?:mut\s+)?\w*\s*$/.test(beforeMatch)) {
      return;
    }

    // Check if this is a declared variable being reassigned
    if (declaredVars.has(varName) && !mutableVars.has(varName)) {
      throw new Error("Cannot reassign immutable variable '" + varName + "'");
    }
  });
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
  validateImmutability(source);
  const allTypes = extractAndValidateAnnotations(source);
  const hasMutation = /let\s+mut\s+/.test(source);
  let compiled = processMutableVariables(source);
  if (!hasMutation) {
    compiled = processVariableDeclarations(compiled);
  }
  compiled = removeTypeAnnotations(compiled);
  compiled = removeCurlyBraces(compiled);
  validateExpressionResult(compiled, allTypes);
  return 'return ' + compiled;
}
