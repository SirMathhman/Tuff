export function interpret(input: string): number {
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();
  if (trimmed.startsWith("-")) {
    const uIndex = upper.lastIndexOf("U");
    if (uIndex !== -1) {
      const suffix = upper.substring(uIndex + 1);
      let isAllDigits = true;
      for (let i = 0; i < suffix.length; i++) {
        const char = suffix.charAt(i);
        if (char < "0" || char > "9") {
          isAllDigits = false;
          break;
        }
      }
      if (isAllDigits) {
        throw new Error("Unsigned integer cannot be negative");
      }
    }
  }
  return parseFloat(trimmed);
}
