/**
 * Interpret a string and return a number.
 * Current implementation parses a leading numeric prefix and allows trailing text
 * only for non-negative numbers. If a negative number has trailing text, an
 * Error is thrown.
 * TODO: extend to support expressions or other formats.
 */
export function interpret(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") return NaN;

  const { numStr, rest } = parseNumericPrefix(trimmed);
  if (numStr === "") return NaN;

  const value = Number(numStr);
  if (!Number.isFinite(value)) return NaN;

  if (rest === "") return value;

  if (numStr.startsWith("-")) {
    throw new Error("Invalid trailing characters after negative number");
  }

  return value;
}

function isDigit(ch: string): boolean {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return c >= 48 && c <= 57;
}

function consumeDigits(s: string, i: number): { i: number; count: number } {
  const start = i;
  while (i < s.length && isDigit(s[i])) i++;
  return { i, count: i - start };
}

function tryParseExponent(s: string, i: number): number {
  if (i >= s.length) return i;
  const ch = s[i];
  if (ch !== "e" && ch !== "E") return i;
  let j = i + 1;
  if (j < s.length && (s[j] === "+" || s[j] === "-")) j++;
  const { i: jAfter, count } = consumeDigits(s, j);
  if (count === 0) return i; // invalid exponent, don't consume
  return jAfter;
}

function parseNumericPrefix(s: string): { numStr: string; rest: string } {
  let i = 0;
  const n = s.length;

  // optional sign
  if (s[i] === "+" || s[i] === "-") i++;

  const { i: afterInt, count: intCount } = consumeDigits(s, i);
  i = afterInt;

  // fractional part
  let fracCount = 0;
  if (i < n && s[i] === ".") {
    i++; // consume dot
    const { i: afterFrac, count } = consumeDigits(s, i);
    fracCount = count;
    i = afterFrac;
    if (intCount === 0 && fracCount === 0) {
      return { numStr: "", rest: s };
    }
  } else if (intCount === 0) {
    return { numStr: "", rest: s };
  }

  // optional exponent (only consume if valid)
  i = tryParseExponent(s, i);

  return { numStr: s.slice(0, i), rest: s.slice(i) };
}
