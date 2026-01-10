/**
 * interpret - parse and evaluate the given string input and return a number
 *
 * Current behavior (stub + incremental implementation):
 *  - If the input is a numeric literal (integer or decimal, optional +/-) it
 *    returns the numeric value.
 *  - For any other input it returns 0 for now (keeps previous tests passing).
 */
export function interpret(input: string): number {
  const s = input.trim();

  // parse a leading numeric prefix without regex
  function parseLeadingNumber(str: string): number | null {
    if (str.length === 0) return null;
    let i = 0;
    const n = str.length;
    // optional sign
    if (str[i] === "+" || str[i] === "-") i++;
    if (i === n) return null; // only sign

    const startDigits = i;
    while (i < n && str.charCodeAt(i) >= 48 && str.charCodeAt(i) <= 57) {
      i++;
    }
    if (i === startDigits) return null; // no digits before decimal

    // optional fractional part
    if (i < n && str[i] === ".") {
      i++; // skip '.'
      const startFrac = i;
      while (i < n && str.charCodeAt(i) >= 48 && str.charCodeAt(i) <= 57) {
        i++;
      }
      if (i === startFrac) return null; // no digits after decimal
    }

    // parse the numeric prefix
    const numStr = str.slice(0, i);
    const value = Number(numStr);
    return Number.isFinite(value) ? value : null;
  }

  const leading = parseLeadingNumber(s);
  if (leading !== null) return leading;

  // fallback until more cases are provided
  return 0;
}
