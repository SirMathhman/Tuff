export function handleMessage(message: string): string {
  if (message === "boom") throw new Error(message);

  // Extract a leading arithmetic expression composed of digits, spaces,
  // decimal points and the basic operators + - * / and parentheses.
  const match = message.match(/^[0-9+\-*/().\s]+/);
  if (match && match[0].trim().length > 0) {
    const expr = match[0].trim();
    // Only evaluate if the expression contains at least one operator.
    if (/[+\-*/()]/.test(expr)) {
      // Validate allowed characters for safety (already done by regex above,
      // but keep this extra guard).
      if (/^[0-9+\-*/().\s]+$/.test(expr)) {
        try {
          // Evaluate the arithmetic expression in a restricted way.
          // Using Function here is acceptable because the input is validated
          // to contain only numeric and operator characters.
          // eslint-disable-next-line no-new-func
          const result = new Function(`return (${expr})`)();
          return String(result);
        } catch {
          // On any evaluation error fall back to returning the original message
          return message;
        }
      }
    }
  }

  return message;
}
