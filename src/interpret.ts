export function interpret(input: string): number {
  const trimmed = input.trim();

  // Direct numeric literal (fast path)
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && trimmed !== "") {
    return numeric;
  }

  // Tokenize into numbers and + / - operators, supporting unary + / - for numbers
  type Token = { type: 'num'; value: number } | { type: 'op'; value: '+' | '-' };

  const tokens: Token[] = [];
  let i = 0;
  const s = trimmed;

  const isDigit = (ch: string) => /[0-9]/.test(ch);

  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (ch === '+' || ch === '-') {
      // Determine if this is a unary sign for a number (start or after an operator)
      const prev = tokens.length ? tokens[tokens.length - 1] : null;
      const nextChar = s[i + 1];
      if (!prev || prev.type === 'op') {
        // Unary sign: consume sign and parse number
        let j = i + 1;
        // allow optional digits and decimal point
        let numStr = ch; // include sign
        // skip whitespace between sign and number
        while (j < s.length && s[j] === ' ') j++;
        let hasDigits = false;
        let hasDot = false;
        while (j < s.length) {
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
        const v = Number(numStr);
        if (Number.isNaN(v)) throw new Error('Invalid numeric input');
        tokens.push({ type: 'num', value: v });
        i = j;
        continue;
      } else {
        // binary operator
        tokens.push({ type: 'op', value: ch });
        i++;
        continue;
      }
    }

    // number starting without sign
    if (isDigit(ch) || ch === '.') {
      let j = i;
      let numStr = '';
      let hasDigits = false;
      let hasDot = false;
      while (j < s.length) {
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
      const v = Number(numStr);
      if (Number.isNaN(v)) throw new Error('Invalid numeric input');
      tokens.push({ type: 'num', value: v });
      i = j;
      continue;
    }

    throw new Error('Invalid numeric input');
  }

  // Expect pattern: num (op num)*
  if (tokens.length === 0) throw new Error('Invalid numeric input');
  if (tokens[0].type !== 'num') throw new Error('Invalid numeric input');

  let acc = tokens[0].value;
  let idx = 1;
  while (idx < tokens.length) {
    const op = tokens[idx];
    const nxt = tokens[idx + 1];
    if (!op || !nxt || op.type !== 'op' || nxt.type !== 'num') throw new Error('Invalid numeric input');
    if (op.value === '+') acc = acc + nxt.value;
    else acc = acc - nxt.value;
    idx += 2;
  }

  return acc;
}
