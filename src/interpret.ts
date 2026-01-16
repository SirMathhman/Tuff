import { type Result, err, ok } from './result';

interface OperatorMatch {
  operator: string;
  index: number;
}

function findTypeSuffixStart(input: string): number {
  for (let i = input.length - 1; i >= 0; i--) {
    const char = input.charAt(i);
    const isDigit = !Number.isNaN(Number.parseInt(char, 10));

    if (!isDigit) {
      return -1;
    }

    if (i === 0) {
      return -1;
    }

    const prevChar = input.charAt(i - 1);
    if (prevChar === 'U' || prevChar === 'I') {
      return i - 1;
    }
  }

  return -1;
}

function extractTypeSuffix(input: string, suffixStart: number): string {
  return input.substring(suffixStart);
}

function validateValueForType(value: number, typeSuffix: string): Result<number> {
  if (typeSuffix === 'U8') {
    if (value < 0 || value > 255) {
      return err(`Value ${value} is out of range for U8 (0-255)`);
    }
  }

  if (typeSuffix === 'U16') {
    if (value < 0 || value > 65535) {
      return err(`Value ${value} is out of range for U16 (0-65535)`);
    }
  }

  return ok(value);
}

function hasNegativeSign(input: string): boolean {
  return input.length > 0 && input.charAt(0) === '-';
}

function parseLiteral(literal: string): Result<number> {
  const trimmed = literal.trim();

  if (hasNegativeSign(trimmed)) {
    return err('Negative numbers are not supported for unsigned types');
  }

  const suffixStart = findTypeSuffixStart(trimmed);
  const numberPart = suffixStart >= 0 ? trimmed.substring(0, suffixStart) : trimmed;
  const value = Number.parseInt(numberPart, 10);

  if (suffixStart >= 0) {
    const typeSuffix = extractTypeSuffix(trimmed, suffixStart);
    return validateValueForType(value, typeSuffix);
  }

  return ok(value);
}

function getTypeRangeMax(typeSuffix: string): number {
  if (typeSuffix === 'U8') {
    return 255;
  }

  if (typeSuffix === 'U16') {
    return 65535;
  }

  return 0;
}

function getTypeSuffix(literal: string): string | undefined {
  const trimmed = literal.trim();
  const suffixStart = findTypeSuffixStart(trimmed);

  if (suffixStart >= 0) {
    return extractTypeSuffix(trimmed, suffixStart);
  }

  return undefined;
}

function collectTypeSuffixes(input: string): string[] {
  const suffixes: string[] = [];
  let current = '';

  for (const char of input) {
    if (char !== '+' && char !== '-' && char !== '*' && char !== '/') {
      current += char;
      continue;
    }

    const suffix = getTypeSuffix(current);
    if (suffix !== undefined) {
      suffixes.push(suffix);
    }

    current = '';
  }

  const suffix = getTypeSuffix(current);
  if (suffix !== undefined) {
    suffixes.push(suffix);
  }

  return suffixes;
}

function skipBackwardWhitespace(input: string, startIndex: number): number {
  let j = startIndex;
  while (j >= 0 && input[j] === ' ') {
    j--;
  }

  return j;
}

function isAlphanumeric(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function findOperator(input: string): OperatorMatch | undefined {
  const operators = ['+', '-', '*', '/'];
  let minIndex = input.length;
  let foundOperator = '';

  for (let i = 1; i < input.length; i++) {
    const char = input[i];
    if (!operators.includes(char)) {
      continue;
    }

    const prevCharIndex = skipBackwardWhitespace(input, i - 1);
    if (prevCharIndex >= 0 && isAlphanumeric(input[prevCharIndex]) && i < minIndex) {
      minIndex = i;
      foundOperator = char;
    }
  }

  return foundOperator ? { operator: foundOperator, index: minIndex } : undefined;
}

function evaluateBinaryOp(left: number, operator: string, right: number): Result<number> {
  if (operator === '+') {
    return ok(left + right);
  }

  if (operator === '-') {
    return ok(left - right);
  }

  if (operator === '*') {
    return ok(left * right);
  }

  if (operator === '/') {
    if (right === 0) {
      return err('Division by zero');
    }

    return ok(Math.floor(left / right));
  }

  return err(`Unknown operator: ${operator}`);
}

export function interpret(input: string): Result<number> {
  const operatorMatch = findOperator(input);

  if (operatorMatch === undefined) {
    return parseLiteral(input);
  }

  const { operator, index: operatorIndex } = operatorMatch;
  const leftStr = input.substring(0, operatorIndex);
  const rightStr = input.substring(operatorIndex + 1);

  const leftResult = parseLiteral(leftStr);
  if (leftResult.type === 'err') {
    return leftResult;
  }

  const rightMatch = findOperator(rightStr);
  let rightValue: number;

  if (rightMatch === undefined) {
    const rightResult = parseLiteral(rightStr);
    if (rightResult.type === 'err') {
      return rightResult;
    }

    rightValue = rightResult.value;
  } else {
    const rightInterpret = interpret(rightStr);
    if (rightInterpret.type === 'err') {
      return rightInterpret;
    }

    rightValue = rightInterpret.value;
  }

  const opResult = evaluateBinaryOp(leftResult.value, operator, rightValue);
  if (opResult.type === 'err') {
    return opResult;
  }

  const allTypeSuffixes = collectTypeSuffixes(input);
  if (allTypeSuffixes.length > 0) {
    const largestType = allTypeSuffixes.reduce((largest, current) => {
      return getTypeRangeMax(current) >= getTypeRangeMax(largest) ? current : largest;
    });
    return validateValueForType(opResult.value, largestType);
  }

  return opResult;
}
