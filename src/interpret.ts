/**
 * Interpret the given string and return a numeric result.
 *
 * Minimal implementation: parse a numeric string and simple `a + b` expressions.
 */
export function interpret(input: string): number {
  const trimmed = input.trim();

  // Tokenize numbers and operators (+, -, *, /). Negative numbers are allowed.
  const tokens = trimmed.match(/-?\d+(?:\.\d+)?|[+\-*/]/g);
  if (tokens && tokens.length > 0) {
    // If the first token isn't a number, fallback to numeric coercion
    if (!/^(-?\d)/.test(tokens[0])) {
      return Number(trimmed);
    }

    // First pass: handle * and / with higher precedence.
    const afterMulDiv: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      if ((tk === '*' || tk === '/') && afterMulDiv.length > 0) {
        const prev = Number(afterMulDiv.pop());
        const next = Number(tokens[++i]);
        const res = tk === '*' ? prev * next : prev / next;
        afterMulDiv.push(String(res));
      } else {
        afterMulDiv.push(tk);
      }
    }

    // Second pass: evaluate + and - left-to-right.
    let acc = Number(afterMulDiv[0]);
    for (let i = 1; i < afterMulDiv.length; i += 2) {
      const op = afterMulDiv[i];
      const next = Number(afterMulDiv[i + 1]);
      if (op === '+') acc += next;
      else if (op === '-') acc -= next;
      else return Number(trimmed); // unexpected token
    }
    return acc;
  }

  // Default: coerce to number
  return Number(trimmed);
}
