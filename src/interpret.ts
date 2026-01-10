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
  // match integer or decimal numbers, optionally signed — implement without regex
  function isNumericString(str: string): boolean {
    if (str.length === 0) return false;
    let i = 0;
    const n = str.length;
    // optional sign
    if (str[i] === '+' || str[i] === '-') i++;
    if (i === n) return false; // only sign

    // digits before decimal (at least one)
    let seenDigitBefore = false;
    while (i < n && str.charCodeAt(i) >= 48 && str.charCodeAt(i) <= 57) {
      seenDigitBefore = true;
      i++;
    }

    // optional fractional part
    if (i < n && str[i] === '.') {
      i++; // skip '.'
      let seenDigitAfter = false;
      while (i < n && str.charCodeAt(i) >= 48 && str.charCodeAt(i) <= 57) {
        seenDigitAfter = true;
        i++;
      }
      // must have digits both before and after decimal
      return seenDigitBefore && seenDigitAfter && i === n;
    }

    return seenDigitBefore && i === n;
  }

  if (isNumericString(s)) {
    return Number(s);
  }

  // fallback until more cases are provided
  return 0;
}
