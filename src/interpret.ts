/**
 * Interpret the given input string and return a numeric result.
 *
 * Supports numeric literals with optional type suffixes (e.g., "100U8", "42I32").
 * Also supports simple arithmetic expressions (e.g., "1U8 + 2U8").
 * Negative numbers cannot have unsigned type suffixes (U8, U16, etc.).
 * Values must be within the valid range for their type suffix.
 */

const typeRanges: Record<string, [number, number]> = {
  U8: [0, 255],
  U16: [0, 65535],
  U32: [0, 4294967295],
  I8: [-128, 127],
  I16: [-32768, 32767],
  I32: [-2147483648, 2147483647],
  Bool: [0, 1],
};

const typeOrdering: Record<string, number> = {
  U8: 0,
  U16: 1,
  U32: 2,
  I8: 10,
  I16: 11,
  I32: 12,
  Bool: 100,
};

type Result = {
  value: number;
  type?: string;
  isMutable?: boolean;
  isInitialized?: boolean;
};
type Variables = Map<string, Result>;

function getWidestType(types: (string | undefined)[]): string | undefined {
  let maxOrder = -1;
  let maxType: string | undefined;

  for (const type of types) {
    if (!type) continue;

    const order = typeOrdering[type];
    if (order === undefined) continue;

    if (order > maxOrder) {
      maxOrder = order;
      maxType = type;
    }
  }

  return maxType;
}

function parseTypedNumber(input: string): Result {
  if (input === 'true') {
    return { value: 1, type: 'Bool', isInitialized: true };
  }
  if (input === 'false') {
    return { value: 0, type: 'Bool', isInitialized: true };
  }

  // Match numeric part followed by optional type suffix
  const match = input.match(/^(-?\d+(?:\.\d+)?)\s*([A-Za-z]\w*)?$/);

  if (!match) {
    throw new Error('Invalid number: ' + input);
  }

  const number = match[1];
  const typeSuffix = match[2];

  // Negative numbers cannot have unsigned type suffixes
  if (number.startsWith('-') && typeSuffix && typeSuffix.startsWith('U')) {
    throw new Error('Invalid number: ' + input);
  }

  const value = Number(number);
  if (Number.isNaN(value)) {
    throw new Error('Invalid number: ' + input);
  }

  // Check if value is within valid range for the type suffix
  if (typeSuffix && typeSuffix in typeRanges) {
    const [min, max] = typeRanges[typeSuffix];
    if (value < min || value > max) {
      throw new Error('Invalid number: ' + input);
    }
  }

  return { value, type: typeSuffix };
}

export function interpret(input: string): number {
  return interpretInternal(input).value;
}

function splitStatements(input: string): string[] {
  const statements: string[] = [];
  let currentArray = '';
  let depth = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '{') depth++;
    if (char === '}') depth--;

    if (char === ';' && depth === 0) {
      statements.push(currentArray.trim());
      currentArray = '';
    } else {
      currentArray += char;
    }
  }

  if (currentArray.trim()) {
    statements.push(currentArray.trim());
  }

  return statements;
}

function substituteResult(
  resolved: string,
  res: Result,
  match: RegExpMatchArray
): string {
  if (res.type === 'Empty') {
    return (
      resolved.substring(0, match.index) +
      resolved.substring(match.index! + match[0].length)
    );
  }
  const replacement = res.value.toString() + (res.type || '');
  return (
    resolved.substring(0, match.index) +
    replacement +
    resolved.substring(match.index! + match[0].length)
  );
}

function resolveInnermostGrouping(
  resolved: string,
  variables: Variables
): string | null {
  const match = resolved.match(/(\([^(){}]*\)|\{[^(){}]*\})/);
  if (!match) return null;

  const group = match[0];
  const subExpr = group.substring(1, group.length - 1);
  const isBlock = group.startsWith('{');

  const res = interpretInternal(
    subExpr,
    isBlock ? new Map(variables) : variables
  );

  return substituteResult(resolved, res, match);
}

function resolveFlatIfExpression(
  resolved: string,
  variables: Variables
): string | null {
  const operand =
    '(?:-?\\d+(?:\\.\\d+)?(?:[A-Za-z]\\w*)?|\\b(?!if\\b|else\\b)[A-Za-z]\\w*)';
  const ifRegex = new RegExp(
    '\\bif\\s+(' +
      operand +
      ')\\s+(' +
      operand +
      ')\\s+else\\s+(' +
      operand +
      ')'
  );

  const match = resolved.match(ifRegex);
  if (!match) return null;

  const cond = resolveOperand(match[1], variables);
  if (cond.type !== 'Bool') {
    throw new Error('If condition must be Bool');
  }

  const res1 = resolveOperand(match[2], variables);
  const res2 = resolveOperand(match[3], variables);

  const t1 = res1.type;
  const t2 = res2.type;

  // Enforce type compatibility between branches
  const isBool1 = t1 === 'Bool';
  const isBool2 = t2 === 'Bool';

  if (isBool1 !== isBool2) {
    throw new Error('Mismatched branch types in if-else');
  }

  // If numeric, check signed/unsigned mixing
  if (!isBool1) {
    const isU1 = t1 && t1.startsWith('U');
    const isU2 = t2 && t2.startsWith('U');
    const isI1 = t1 && t1.startsWith('I');
    const isI2 = t2 && t2.startsWith('I');

    if ((isU1 && isI2) || (isI1 && isU2)) {
      throw new Error('Mismatched branch types in if-else');
    }
  }

  const resultType = getWidestType([t1, t2]);
  const finalRes = cond.value !== 0 ? res1 : res2;
  const result = { value: finalRes.value, type: resultType };

  return substituteResult(resolved, result, match);
}

function resolveStatement(statement: string, variables: Variables): string {
  let resolved = statement;

  while (
    resolved.includes('(') ||
    resolved.includes('{') ||
    /\bif\b/.test(resolved)
  ) {
    const nextGroup = resolveInnermostGrouping(resolved, variables);
    if (nextGroup !== null) {
      resolved = nextGroup;
      continue;
    }

    const nextIf = resolveFlatIfExpression(resolved, variables);
    if (nextIf !== null) {
      resolved = nextIf;
      continue;
    }

    break;
  }

  return resolved;
}

function interpretInternal(
  input: string,
  variables: Variables = new Map()
): Result {
  const statements = splitStatements(input);

  if (statements.length === 0) {
    return { value: 0, type: 'Empty', isInitialized: false };
  }

  let result: Result | undefined;

  for (const statement of statements) {
    const resolved = resolveStatement(statement, variables);

    const letAnnotatedMatch = resolved.match(
      /^let\s+(mut\s+)?([A-Za-z]\w*)\s*:\s*([A-Za-z]\w*)\s*=\s*(.+)$/
    );
    const letNoInitMatch = resolved.match(
      /^let\s+(mut\s+)?([A-Za-z]\w*)\s*:\s*([A-Za-z]\w*)$/
    );
    const letInferredMatch = resolved.match(
      /^let\s+(mut\s+)?([A-Za-z]\w*)\s*=\s*(.+)$/
    );
    const assignmentMatch = resolved.match(/^([A-Za-z]\w*)\s*=\s*(.+)$/);

    if (letAnnotatedMatch) {
      result = handleLetStatement(
        resolved,
        variables,
        letAnnotatedMatch[2],
        letAnnotatedMatch[4],
        letAnnotatedMatch[3],
        !!letAnnotatedMatch[1]
      );
    } else if (letNoInitMatch) {
      result = handleLetStatement(
        resolved,
        variables,
        letNoInitMatch[2],
        undefined,
        letNoInitMatch[3],
        !!letNoInitMatch[1]
      );
    } else if (letInferredMatch) {
      result = handleLetStatement(
        resolved,
        variables,
        letInferredMatch[2],
        letInferredMatch[3],
        undefined,
        !!letInferredMatch[1]
      );
    } else if (assignmentMatch) {
      result = handleAssignmentStatement(
        resolved,
        variables,
        assignmentMatch[1],
        assignmentMatch[2]
      );
    } else {
      result = evaluateStatement(resolved, variables);
    }
  }

  if (!result) {
    throw new Error('Empty expression');
  }

  return result;
}

function validateTypeCompatibility(
  targetType: string | undefined,
  sourceResult: Result,
  statement: string
): void {
  if (
    targetType &&
    sourceResult.type &&
    targetType in typeOrdering &&
    sourceResult.type in typeOrdering
  ) {
    const targetIsUnsigned = targetType.startsWith('U');
    const sourceIsSigned = sourceResult.type.startsWith('I');
    const targetIsSigned = targetType.startsWith('I');
    const sourceIsUnsigned = sourceResult.type.startsWith('U');

    if (
      typeOrdering[sourceResult.type] > typeOrdering[targetType] ||
      (targetIsUnsigned && sourceIsSigned) ||
      (targetIsSigned && sourceIsUnsigned)
    ) {
      throw new Error('Invalid type: ' + statement);
    }
  }

  if (targetType && targetType in typeRanges) {
    const [min, max] = typeRanges[targetType];
    if (sourceResult.value < min || sourceResult.value > max) {
      throw new Error('Invalid number: ' + statement);
    }
  }
}

function handleLetStatement(
  statement: string,
  variables: Variables,
  name: string,
  expr?: string,
  type?: string,
  isMutable?: boolean
): Result {
  if (variables.has(name)) {
    throw new Error('Variable already declared: ' + name);
  }

  let value = 0;
  let finalType = type;
  let isInitialized = false;

  if (expr) {
    const res = interpretInternal(expr, variables);
    finalType = type || res.type;
    validateTypeCompatibility(type, res, statement);
    value = res.value;
    isInitialized = true;
  }

  const variable = { value, type: finalType, isMutable, isInitialized };
  variables.set(name, variable);
  return variable;
}

function handleAssignmentStatement(
  statement: string,
  variables: Variables,
  name: string,
  expr: string
): Result {
  if (!variables.has(name)) {
    throw new Error('Cannot assign to undeclared variable: ' + name);
  }

  const variable = variables.get(name)!;
  if (!variable.isMutable && variable.isInitialized) {
    throw new Error('Cannot assign to immutable variable: ' + name);
  }

  const res = interpretInternal(expr, variables);

  validateTypeCompatibility(variable.type, res, statement);

  variable.value = res.value;
  variable.isInitialized = true;
  return variable;
}

function evaluateStatement(statement: string, variables: Variables): Result {
  const trimmed = statement.trim();
  if (!trimmed) {
    return { value: 0, type: 'Empty', isInitialized: false };
  }
  if (/[+\-*/]|\|\||&&/.test(trimmed)) {
    return evaluateExpression(trimmed, variables);
  }
  return resolveOperand(trimmed, variables);
}

function applyOperator(
  resultValue: number,
  op: string,
  nextOperand: number
): number {
  switch (op) {
    case '+':
      return resultValue + nextOperand;
    case '-':
      return resultValue - nextOperand;
    case '*':
      return resultValue * nextOperand;
    case '/':
      if (nextOperand === 0) {
        throw new Error('Division by zero');
      }
      return Math.floor(resultValue / nextOperand);
    case '||':
      return resultValue || nextOperand ? 1 : 0;
    case '&&':
      return resultValue && nextOperand ? 1 : 0;
    default:
      throw new Error('Unknown operator: ' + op);
  }
}

function resolveOperand(token: string, variables: Variables): Result {
  const trimmed = token.trim();
  if (variables.has(trimmed)) {
    const variable = variables.get(trimmed)!;
    if (variable.isInitialized === false) {
      throw new Error('Use of uninitialized variable: ' + trimmed);
    }
    return variable;
  }
  return parseTypedNumber(trimmed);
}

function tokenizeExpression(
  expr: string,
  variables: Variables
): {
  operands: Result[];
  operators: string[];
} {
  const tokens = expr.match(
    /(-?\d+(?:\.\d+)?(?:[A-Za-z]\w*)?|[A-Za-z]\w*|\|\||&&|[+\-*/])/g
  );

  if (!tokens || tokens.length === 0) {
    throw new Error('Invalid expression: ' + expr);
  }

  const operands: Result[] = [];
  const operators: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (i % 2 === 0) {
      operands.push(resolveOperand(token, variables));
    } else {
      operators.push(token);
    }
  }

  if (operands.length !== operators.length + 1) {
    throw new Error('Invalid expression: ' + expr);
  }

  return { operands, operators };
}

function applyPrecedenceLevel(
  level: string[],
  values: number[],
  currentOperators: string[]
): void {
  for (let i = 0; i < currentOperators.length; ) {
    const op = currentOperators[i];
    if (level.includes(op)) {
      values[i] = applyOperator(values[i], op, values[i + 1]);
      values.splice(i + 1, 1);
      currentOperators.splice(i, 1);
    } else {
      i++;
    }
  }
}

function evaluateExpression(expr: string, variables: Variables): Result {
  const { operands, operators } = tokenizeExpression(expr, variables);

  // Collect all types from operands
  const types = operands.map((op) => op.type);

  // Arithmetic operators (+) are not supported for Bool type,
  // but logical operators (||, &&) are.
  const hasLogical = operators.some((op) => op === '||' || op === '&&');
  const hasArithmetic = operators.some((op) => /[+\-*/]/.test(op));
  const hasBool = types.some((t) => t === 'Bool');

  if (hasBool && hasArithmetic) {
    throw new Error('Arithmetic operators not supported for Bool: ' + expr);
  }
  if (hasLogical && types.some((t) => t !== 'Bool')) {
    throw new Error('Logical operators only supported for Bool: ' + expr);
  }

  // Determine the widest type
  const resultType = hasLogical ? 'Bool' : getWidestType(types);

  // Evaluate with operator precedence (* and / before + and -, etc)
  const values = operands.map((op) => op.value);
  const currentOperators = [...operators];

  // Operator precedence passes
  const precedenceLevels = [['*', '/'], ['+', '-'], ['&&'], ['||']];

  for (const level of precedenceLevels) {
    applyPrecedenceLevel(level, values, currentOperators);
  }

  const resultValue = values[0];

  // Validate result is within valid range for the result type
  if (resultType && resultType in typeRanges) {
    const [min, max] = typeRanges[resultType];
    if (resultValue < min || resultValue > max) {
      throw new Error('Invalid expression: ' + expr);
    }
  }

  return { value: resultValue, type: resultType };
}
