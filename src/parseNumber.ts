export function parseNumber(s: string, i: number): { value: number; nextIndex: number } {
  const len = s.length;
  let j = i;

  // optional sign
  let sign = 1;
  if (s[j] === '+' || s[j] === '-') {
    if (s[j] === '-') sign = -1;
    j++;
  }

  // skip whitespace between sign and digits
  while (j < len && s[j] === ' ') j++;

  let numStr = '';
  let hasDigits = false;
  let hasDot = false;

  const isDigit = (ch: string) => /[0-9]/.test(ch);

  while (j < len) {
    const c = s[j];
    if (isDigit(c)) {
      numStr += c;
      hasDigits = true;
      j++;
    } else if (c === '.' && !hasDot) {
      numStr += c;
      hasDot = true;
      j++;
    } else {
      break;
    }
  }

  if (!hasDigits) throw new Error('Invalid numeric input');

  const value = sign * Number(numStr);
  if (Number.isNaN(value)) throw new Error('Invalid numeric input');

  return { value, nextIndex: j };
}
