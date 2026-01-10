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
  // match integer or decimal numbers, optionally signed
  const numberRegex = /^[+-]?\d+(?:\.\d+)?$/;
  if (s.match(numberRegex)) {
    return Number(s);
  }
  // fallback until more cases are provided
  return 0;
}
