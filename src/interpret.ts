/**
 * Interpret the given string and return a numeric result.
 *
 * Minimal implementation: parse a numeric string and simple `a + b` expressions.
 */
export function interpret(input: string): number {
  const trimmed = input.trim();

  // Minimal expression support: evaluate left-to-right for + and -.
  // Tokenize numbers and operators (+, -).
  const tokens = trimmed.match(/-?\d+(?:\.\d+)?|[+\-]/g);
  if (tokens && tokens.length > 0) {
    // First token should be a number for well-formed input; otherwise fall back.
    if (!/^(-?\d)/.test(tokens[0])) {
      return Number(trimmed);
    }

    let acc = Number(tokens[0]);
    for (let i = 1; i < tokens.length; i += 2) {
      const op = tokens[i];
      const next = Number(tokens[i + 1]);
      if (op === "+") {
        acc += next;
      } else if (op === "-") {
        acc -= next;
      } else {
        // Unknown token; fallback to numeric coercion
        return Number(trimmed);
      }
    }
    return acc;
  }

  // Default: coerce to number
  return Number(trimmed);
}
