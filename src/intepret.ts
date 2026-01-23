/**
 * Stubbed function `intepret` — parses a string input and returns a number.
 * Implementation TODO.
 *
 * Behavior implemented so far:
 *  - empty or whitespace-only string => 0
 *  - numeric string => parsed number
 *  - otherwise => NaN
 *
 * @param input - the input string to interpret
 * @returns number result of interpretation
 */
export function intepret(input: string): number {
  const s = input.trim();
  if (s === "") return 0;

  // Extract leading numeric part (handles both "100" and "100U8" => "100")
  let numPart = "";
  let i = 0;
  while (i < s.length && s[i] >= "0" && s[i] <= "9") {
    numPart = numPart + s[i];
    i = i + 1;
  }

  const n = Number(numPart);
  if (!Number.isNaN(n) && Number.isFinite(n)) return n;

  // For non-numeric input, return NaN (avoid throwing; prefer Result<T,E> pattern)
  return NaN;
}
