import { type Result, err, ok } from './result';

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

function findOperator(input: string): string {
  const operators = ['+', '-', '*', '/'];
  for (const op of operators) {
    const index = input.indexOf(op, 1);
    if (index >= 0) {
      return op;
    }
  }

  return '';
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
  const operator = findOperator(input);

  if (operator === '') {
    return parseLiteral(input);
  }

  const operatorIndex = input.indexOf(operator);
  const leftStr = input.substring(0, operatorIndex);
  const rightStr = input.substring(operatorIndex + 1);

  const leftResult = parseLiteral(leftStr);
  if (leftResult.type === 'err') {
    return leftResult;
  }

  const rightResult = parseLiteral(rightStr);
  if (rightResult.type === 'err') {
    return rightResult;
  }

  return evaluateBinaryOp(leftResult.value, operator, rightResult.value);
}
