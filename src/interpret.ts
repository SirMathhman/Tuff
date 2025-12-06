export function interpret(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '') return '';

  // If the input is a plain number, return it unchanged
  const numberOnly = /^[+-]?\d+(?:\.\d+)?$/.test(trimmed);
  if (numberOnly) return trimmed;

  // Allow only numbers, whitespace and arithmetic operators so we can safely evaluate
  const safeExpr = /^[0-9+\-*/().\s]+$/.test(trimmed);
  if (!safeExpr) return input;

  try {
    // Evaluate in a restricted way — only arithmetic expressions allowed
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${trimmed})`)();
    if (typeof result === 'number' && Number.isFinite(result)) {
      return Number.isInteger(result) ? String(result) : String(result);
    }
  } catch (e) {
    // fall through to return original input on any error
  }

  return input;
}
