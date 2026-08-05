export type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: "+" | "-" | "*" | "/" }
  | { type: "paren"; value: "(" | ")" };

/**
 * Convert a source string into a stream of tokens.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source.charAt(i);

    // Skip whitespace
    if (/\s/.test(char)) {
      i++;
      continue;
    }

    // Number (integer or decimal)
    if (/[0-9.]/.test(char)) {
      let num = "";
      while (i < source.length && /[0-9.]/.test(source.charAt(i))) {
        num += source.charAt(i);
        i++;
      }
      tokens.push({ type: "number", value: Number(num) });
      continue;
    }

    // Operator
    if ("+-*/".includes(char)) {
      const op = char as "+" | "-" | "*" | "/";
      tokens.push({ type: "operator", value: op });
      i++;
      continue;
    }

    // Parentheses
    if (char === "(" || char === ")") {
      const paren = char as "(" | ")";
      tokens.push({ type: "paren", value: paren });
      i++;
      continue;
    }

    throw new Error(`Unexpected character: "${char}" at position ${i}`);
  }

  return tokens;
}
