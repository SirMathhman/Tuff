export type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" | "/" };

/**
 * Convert a source string into a stream of tokens.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    // Skip whitespace
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }

    // Number (integer or decimal)
    if (/[0-9.]/.test(source[i])) {
      let num = "";
      while (i < source.length && /[0-9.]/.test(source[i])) {
        num += source[i];
        i++;
      }
      tokens.push({ type: "number", value: Number(num) });
      continue;
    }

    // Operator
    if ("+-*/".includes(source[i])) {
      const op = source[i] as "+" | "-" | "*" | "/";
      tokens.push({ type: "operator", value: op });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: "${source[i]}" at position ${i}`);
  }

  return tokens;
}
