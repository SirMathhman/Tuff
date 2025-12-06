export function interpret(input: string): string {
  const trimmed = input.trim();

  // Check if it's a simple number
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  // Handle arithmetic expressions using eval with strict validation
  // Only allow numbers, operators, and spaces
  if (!/^[\d\s+\-*/().]+$/.test(trimmed)) {
    return input;
  }

  try {
    // We use eval here for arithmetic evaluation after validating input pattern
    const result = eval(trimmed);
    return String(result);
  } catch {
    return input;
  }
}

export default interpret;
