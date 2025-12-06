export function interpret(input: string): string {
  const trimmed = input.trim();

  // Check if it's a simple number
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  // Handle arithmetic expressions
  try {
    // Use Function constructor to safely evaluate (in a controlled context)
    // Only allow numbers, operators, and spaces
    if (!/^[\d\s+\-*/().]+$/.test(trimmed)) {
      return input;
    }

    const result = Function(`"use strict"; return (${trimmed})`)();
    return String(result);
  } catch {
    return input;
  }
}

export default interpret;
