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

export function interpret(input: string): Result<number> {
  if (hasNegativeSign(input)) {
    return err('Negative numbers are not supported for unsigned types');
  }

  const suffixStart = findTypeSuffixStart(input);
  const numberPart = suffixStart >= 0 ? input.substring(0, suffixStart) : input;
  const value = Number.parseInt(numberPart, 10);

  if (suffixStart >= 0) {
    const typeSuffix = extractTypeSuffix(input, suffixStart);
    return validateValueForType(value, typeSuffix);
  }

  return ok(value);
}
