import { Result, ok, err } from "../result";

export interface ParseNumberResult {
  value: number;
  nextIndex: number;
}

export function parseNumber(
  s: string,
  i: number
): Result<ParseNumberResult, string> {
  const len = s.length;
  let j = i;

  // optional sign
  let sign = 1;
  if (s[j] === "+" || s[j] === "-") {
    if (s[j] === "-") sign = -1;
    j++;
  }

  // skip whitespace between sign and digits
  while (j < len && s[j] === " ") j++;

  let numStr = "";
  let hasDigits = false;
  let hasDot = false;

  const isDigit = (ch: string) => /[0-9]/.test(ch);

  while (j < len && (isDigit(s[j]) || (s[j] === "." && !hasDot))) {
    const c = s[j];
    if (isDigit(c)) {
      numStr += c;
      hasDigits = true;
    } else {
      // must be a '.' (and !hasDot) due to loop predicate
      numStr += c;
      hasDot = true;
    }
    j++;
  }

  if (!hasDigits) return err("Invalid numeric input");

  const value = sign * Number(numStr);
  if (Number.isNaN(value)) return err("Invalid numeric input");

  return ok({ value, nextIndex: j });
}
