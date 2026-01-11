/**
 * Interpret a string and return a number.
 * Current implementation parses a leading numeric prefix and allows trailing text
 * only for non-negative numbers. If a negative number has trailing text, an
 * Error is thrown.
 * TODO: extend to support expressions or other formats.
 */
export function interpret(input: string): number {
  // Trim whitespace and parse a leading numeric value. If not a valid number, return NaN.
  const trimmed = input.trim();
  if (trimmed === "") return NaN;

  let i = 0;
  const n = trimmed.length;

  // optional sign
  if (trimmed[i] === '+' || trimmed[i] === '-') {
    i++;
  }

  const startDigits = i;
  // digits before decimal
  while (i < n && trimmed.charCodeAt(i) >= 48 && trimmed.charCodeAt(i) <= 57) {
    i++;
  }
  const digitsBefore = i - startDigits;

  // fractional part
  if (i < n && trimmed[i] === '.') {
    i++; // consume dot
    const fracStart = i;
    while (i < n && trimmed.charCodeAt(i) >= 48 && trimmed.charCodeAt(i) <= 57) {
      i++;
    }
    const digitsAfter = i - fracStart;
    if (digitsBefore === 0 && digitsAfter === 0) {
      // something like "+." or "-." or just "." without digits
      return NaN;
    }
  } else if (digitsBefore === 0) {
    // no digits at all (and no fractional part)
    return NaN;
  }

  // optional exponent part, but only consume it if it's valid (e.g., e[+-]?\d+)
  if (i < n && (trimmed[i] === 'e' || trimmed[i] === 'E')) {
    let j = i + 1;
    if (j < n && (trimmed[j] === '+' || trimmed[j] === '-')) j++;
    const expStart = j;
    while (j < n && trimmed.charCodeAt(j) >= 48 && trimmed.charCodeAt(j) <= 57) j++;
    const expDigits = j - expStart;
    if (expDigits > 0) {
      // valid exponent, consume it
      i = j;
    }
    // otherwise leave the 'e' as trailing text
  }

  const numStr = trimmed.slice(0, i);
  const rest = trimmed.slice(i);

  const value = Number(numStr);
  if (!Number.isFinite(value)) return NaN;

  if (rest === "") return value;

  // If there is trailing text after a negative number, consider it an error
  if (numStr.startsWith("-")) {
    throw new Error("Invalid trailing characters after negative number");
  }

  // Otherwise accept the leading numeric prefix
  return value;
}
