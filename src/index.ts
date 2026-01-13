export function interpret(input: string): number {
  const trimmed = input.trim();
  const upper = trimmed.toUpperCase();

  if (!trimmed.startsWith("-")) {
    return parseFloat(trimmed);
  }

  const uIndex = upper.lastIndexOf("U");
  if (uIndex === -1) {
    return parseFloat(trimmed);
  }

  const suffix = upper.substring(uIndex + 1);
  if (isNumeric(suffix)) {
    throw new Error("Unsigned integer cannot be negative");
  }

  return parseFloat(trimmed);
}

function isNumeric(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const char = str.charAt(i);
    if (char < "0" || char > "9") {
      return false;
    }
  }
  return true;
}

