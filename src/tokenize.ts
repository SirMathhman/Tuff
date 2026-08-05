// --- Tokenizer configuration (data-driven) ---
const KEYWORDS = new Set(["let", "mut"]);
const OPERATORS = "+-*\/=".split("");
const DELIMITERS: Record<string, string> = { "(": ")", "{": "}" };

export type Token =
  | { type: "number"; value: number }
  | { type: "operator"; value: (typeof OPERATORS)[number] }
  | { type: "paren"; value: string }
  | { type: "identifier"; value: string }
  | { type: "keyword"; value: string }
  | { type: "semicolon" };

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
    if (OPERATORS.includes(char)) {
      tokens.push({ type: "operator", value: char as "+" | "-" | "*" | "/" | "=" });
      i++;
      continue;
    }

    // Delimiters (parentheses, braces)
    if (char in DELIMITERS || Object.values(DELIMITERS).includes(char)) {
      tokens.push({ type: "paren", value: char as "(" | ")" | "{" | "}" });
      i++;
      continue;
    }

    // Semicolon
    if (char === ";") {
      tokens.push({ type: "semicolon" });
      i++;
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(char)) {
      let name = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source.charAt(i))) {
        name += source.charAt(i);
        i++;
      }
      tokens.push(KEYWORDS.has(name)
        ? { type: "keyword", value: name }
        : { type: "identifier", value: name });
      continue;
    }

    throw new Error(`Unexpected character: "${char}" at position ${i}`);
  }

  return tokens;
}
