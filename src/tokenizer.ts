/**
 * One token of Tuff source text.
 */
export interface Token {
  /** What the token is: plain text, a closed quoted string, or a quoted string that is never closed. */
  kind: "text" | "string" | "unclosedString";
  /** The characters of the token, including the quotes of a quoted string. */
  text: string;
}

/**
 * Returns the text of the token at an index, or the empty string past the end.
 * @param tokens - The token list.
 * @param index - The position of the token.
 * @returns The token's text, or the empty string when there is no token there.
 */
export function textAt(tokens: Token[], index: number): string {
  return tokens[index]?.text ?? "";
}

/**
 * Splits Tuff source text into tokens: numbers, brackets, operators, and quoted strings.
 * @param tuffSource - The raw source text.
 * @returns The tokens in source order, with empty text removed.
 */
export function tokenize(tuffSource: string): Token[] {
  const tokens: Token[] = [];
  let current = "";
  let index = 0;

  while (index < tuffSource.length) {
    const char = tuffSource.charAt(index);
    const pair = tuffSource.slice(index, index + 2);

    if (TWO_CHAR_OPERATORS.includes(pair)) {
      tokens.push(...flush(current), text(pair));
      current = "";
      index += 2;
    } else if (SPACE.includes(char)) {
      tokens.push(...flush(current));
      current = "";
      index += 1;
    } else if (SINGLE_CHAR_TOKENS.includes(char)) {
      tokens.push(...flush(current), text(char));
      current = "";
      index += 1;
    } else if (char === "'") {
      const closing = closingQuote(tuffSource, index);
      const end = closing === undefined ? tuffSource.length : closing + 1;

      tokens.push(...flush(current), {
        kind: closing === undefined ? "unclosedString" : "string",
        text: tuffSource.slice(index, end),
      });
      current = "";
      index = end;
    } else {
      current += char;
      index += 1;
    }
  }

  return [...tokens, ...flush(current)];
}

const SPACE = [" ", "\t", "\n", "\r"];

const TWO_CHAR_OPERATORS = ["<=", ">=", "==", "!=", "&&", "||"];

const SINGLE_CHAR_TOKENS = ["(", ")", "{", "}", "[", "]", ",", "+", "-", "*", ";", "=", "<", ">", "!", "&"];

// Returns the index of the single quote that closes the string opened at start,
// skipping backslash-escaped characters, or undefined when the string is never closed.
function closingQuote(source: string, start: number): number | undefined {
  let index = start + 1;

  while (index < source.length && source.charAt(index) !== "'") {
    index += source.charAt(index) === "\\" ? 2 : 1;
  }

  return index < source.length ? index : undefined;
}

function text(value: string): Token {
  return { kind: "text", text: value };
}

function flush(current: string): Token[] {
  return current === "" ? [] : [text(current)];
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function isLetterOrUnderscore(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_";
}

/**
 * Reports whether a token is made only of decimal digits.
 * @param text - The token to test.
 * @returns True when the token is a non-empty run of digits.
 */
export function isDigits(text: string): boolean {
  return text.length > 0 && [...text].every(isDigit);
}

/**
 * Reports whether a token is a valid name: not reserved, starting with a letter or underscore.
 * @param text - The token to test.
 * @returns True when the token can be used as a name.
 */
export function isIdentifier(text: string): boolean {
  const chars = [...text];

  return (
    text !== "let" &&
    text !== "mut" &&
    text !== "if" &&
    text !== "else" &&
    text !== "true" &&
    text !== "false" &&
    chars.length > 0 &&
    isLetterOrUnderscore(chars[0] ?? "") &&
    chars.every((char) => isLetterOrUnderscore(char) || isDigit(char))
  );
}
