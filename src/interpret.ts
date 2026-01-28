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

function parseTypedNumber(input: string): { value: number; type?: string } {
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
  const trimmed = input.trim();

  // Check if input contains operators
  if (/[+\-*/]/.test(trimmed)) {
    return evaluateExpression(trimmed);
  }

  return parseTypedNumber(trimmed).value;
}

function applyOperator(
  result: number,
  op: string,
  nextOperand: number
): number {
  switch (op) {
    case '+':
      return result + nextOperand;
    case '-':
      return result - nextOperand;
    case '*':
      return result * nextOperand;
    case '/':
      if (nextOperand === 0) {
        throw new Error('Division by zero');
      }
      return Math.floor(result / nextOperand);
    default:
      throw new Error('Unknown operator: ' + op);
  }
}

function tokenizeExpression(expr: string): {
  operands: { value: number; type?: string }[];
  operators: string[];
} {
  const tokens = expr.match(/(-?\d+(?:\.\d+)?[A-Za-z]\w*|[+\-*/])/g);

  if (!tokens || tokens.length === 0) {
    throw new Error('Invalid expression: ' + expr);
  }

  const operands: { value: number; type?: string }[] = [];
  const operators: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0) {
      // Even indices should be operands
      operands.push(parseTypedNumber(tokens[i]));
    } else {
      // Odd indices should be operators
      operators.push(tokens[i]);
    }
  }

  if (operands.length !== operators.length + 1) {
    throw new Error('Invalid expression: ' + expr);
  }

  return { operands, operators };
}

function evaluateExpression(expr: string): number {
  const { operands, operators } = tokenizeExpression(expr);

  // Determine the result type (type of first operand)
  const resultType = operands[0].type;

  // Validate that all operands have consistent typing
  for (const operand of operands) {
    if (
      (resultType === undefined && operand.type !== undefined) ||
      (resultType !== undefined && operand.type === undefined)
    ) {
      throw new Error('Invalid expression: ' + expr);
    }
  }

  // Evaluate left to right
  let result = operands[0].value;
  for (let i = 0; i < operators.length; i++) {
    result = applyOperator(result, operators[i], operands[i + 1].value);
  }

  // Validate result is within valid range for the result type
  if (resultType && resultType in typeRanges) {
    const [min, max] = typeRanges[resultType];
    if (result < min || result > max) {
      throw new Error('Invalid expression: ' + expr);
    }
  }

  return result;
}
