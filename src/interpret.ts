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
};

const typeOrdering: Record<string, number> = {
  U8: 0,
  U16: 1,
  U32: 2,
  I8: 10,
  I16: 11,
  I32: 12,
};

type Result = { value: number; type?: string };
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
  let trimmed = input.trim();

  // Resolve grouped expressions (parentheses or curly braces) from innermost to outermost
  while (trimmed.includes('(') || trimmed.includes('{')) {
    // Look for innermost grouping that contains no other grouping symbols
    const match = trimmed.match(/(\([^(){}]+\)|\{[^(){}]+\})/);
    if (!match) break;

    const group = match[0];
    const subExpr = group.substring(1, group.length - 1);

    const res = interpretInternal(subExpr);
    // Construct replacement string with value and optional type suffix
    const replacement = res.value.toString() + (res.type || '');
    trimmed =
      trimmed.substring(0, match.index) +
      replacement +
      trimmed.substring(match.index! + match[0].length);
  }

  return interpretInternal(trimmed).value;
}

function handleLetStatement(
  statement: string,
  match: RegExpMatchArray,
  variables: Variables
): Result {
  const name = match[1];
  const type = match[2];
  const expr = match[3];

  if (variables.has(name)) {
    throw new Error('Variable already declared: ' + name);
  }

  const res = interpretInternal(expr, variables);
  if (type in typeRanges) {
    const [min, max] = typeRanges[type];
    if (res.value < min || res.value > max) {
      throw new Error('Invalid number: ' + statement);
    }
  }
  const variable = { value: res.value, type };
  variables.set(name, variable);
  return variable;
}

function evaluateStatement(statement: string, variables: Variables): Result {
  if (/[+\-*/]/.test(statement)) {
    return evaluateExpression(statement, variables);
  }
  return resolveOperand(statement, variables);
}

function interpretInternal(
  input: string,
  variables: Variables = new Map()
): Result {
  const statements = input
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let result: Result | undefined;

  for (const statement of statements) {
    const letMatch = statement.match(
      /^let\s+([A-Za-z]\w*)\s*:\s*([A-Za-z]\w*)\s*=\s*(.+)$/
    );

    if (letMatch) {
      result = handleLetStatement(statement, letMatch, variables);
    } else {
      result = evaluateStatement(statement, variables);
    }
  }

  if (!result) {
    throw new Error('Empty expression');
  }

  return result;
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
    default:
      throw new Error('Unknown operator: ' + op);
  }
}

function resolveOperand(token: string, variables: Variables): Result {
  if (variables.has(token)) {
    return variables.get(token)!;
  }
  return parseTypedNumber(token);
}

function tokenizeExpression(
  expr: string,
  variables: Variables
): {
  operands: Result[];
  operators: string[];
} {
  const tokens = expr.match(
    /(-?\d+(?:\.\d+)?(?:[A-Za-z]\w*)?|[A-Za-z]\w*|[+\-*/])/g
  );

  if (!tokens || tokens.length === 0) {
    throw new Error('Invalid expression: ' + expr);
  }

  const operands: Result[] = [];
  const operators: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0) {
      operands.push(resolveOperand(tokens[i], variables));
    } else {
      operators.push(tokens[i]);
    }
  }

  if (operands.length !== operators.length + 1) {
    throw new Error('Invalid expression: ' + expr);
  }

  return { operands, operators };
}

function evaluateExpression(expr: string, variables: Variables): Result {
  const { operands, operators } = tokenizeExpression(expr, variables);

  // Collect all types from operands
  const types = operands.map((op) => op.type);

  // Determine the widest type
  const resultType = getWidestType(types);

  // Validate we're not mixing unsigned and signed types
  const hasUnsigned = types.some((t) => t && t.startsWith('U'));
  const hasSigned = types.some((t) => t && t.startsWith('I'));
  if (hasUnsigned && hasSigned) {
    throw new Error('Invalid expression: ' + expr);
  }

  // Evaluate with operator precedence (* and / before + and -)
  const values = operands.map((op) => op.value);
  const currentOperators = [...operators];

  // First pass: multiplication and division
  for (let i = 0; i < currentOperators.length; ) {
    const op = currentOperators[i];
    if (op === '*' || op === '/') {
      values[i] = applyOperator(values[i], op, values[i + 1]);
      values.splice(i + 1, 1);
      currentOperators.splice(i, 1);
    } else {
      i++;
    }
  }

  // Second pass: addition and subtraction
  let resultValue = values[0];
  for (let i = 0; i < currentOperators.length; i++) {
    resultValue = applyOperator(
      resultValue,
      currentOperators[i],
      values[i + 1]
    );
  }

  // Validate result is within valid range for the result type
  if (resultType && resultType in typeRanges) {
    const [min, max] = typeRanges[resultType];
    if (resultValue < min || resultValue > max) {
      throw new Error('Invalid expression: ' + expr);
    }
  }

  return { value: resultValue, type: resultType };
}
