export function interpret(input: string): number {
  // Remove type suffix (e.g., "U8", "I32", etc.)
  let numberPart = input;

  // Check if string ends with U or I followed by digits
  for (let i = input.length - 1; i >= 0; i--) {
    const char = input.charAt(i);
    if (!Number.isNaN(Number.parseInt(char, 10))) {
      // Current character is a digit
      if (i > 0) {
        const prevChar = input.charAt(i - 1);
        if (prevChar === 'U' || prevChar === 'I') {
          // Found the type suffix start
          numberPart = input.substring(0, i - 1);
          break;
        }
      }
    } else {
      // Not a digit, so stop checking
      break;
    }
  }

  return Number.parseInt(numberPart, 10);
}
