/**
 * Splits Tuff source text into tokens: numbers, brackets, and operators.
 * @param tuffSource - The raw source text.
 * @returns The tokens in source order, with empty strings removed.
 */
export function tokenize(tuffSource: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let index = 0;

  while (index < tuffSource.length) {
    const char = tuffSource.charAt(index);
    const pair = tuffSource.slice(index, index + 2);

    if (TWO_CHAR_OPERATORS.includes(pair)) {
      tokens.push(...flush(current), pair);
      current = "";
      index += 2;
    } else if (SPACE.includes(char)) {
      tokens.push(...flush(current));
      current = "";
      index += 1;
    } else if (SINGLE_CHAR_TOKENS.includes(char)) {
      tokens.push(...flush(current), char);
      current = "";
      index += 1;
    } else if (char === "'") {
      const end = closingQuoteEnd(tuffSource, index);

      tokens.push(...flush(current), tuffSource.slice(index, end));
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

const SINGLE_CHAR_TOKENS = ["(", ")", "{", "}", "+", "-", "*", ";", "=", "<", ">", "!"];

// Returns the index just after the single quote that closes the string opened
// at start, skipping backslash-escaped characters. An unclosed string runs to
// the end of the source, and the parser reports it.
function closingQuoteEnd(source: string, start: number): number {
  let index = start + 1;

  while (index < source.length && source.charAt(index) !== "'") {
    index += source.charAt(index) === "\\" ? 2 : 1;
  }

  return Math.min(index + 1, source.length);
}

function flush(current: string): string[] {
  return current === "" ? [] : [current];
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
