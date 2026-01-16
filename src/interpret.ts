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

export function interpret(input: string): number {
  const suffixStart = findTypeSuffixStart(input);
  const numberPart = suffixStart >= 0 ? input.substring(0, suffixStart) : input;
  return Number.parseInt(numberPart, 10);
}
