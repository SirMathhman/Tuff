/**
 * Check if character is whitespace
 */
export function isWhitespace(ch: string | undefined): ch is string {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

/**
 * Check if character is valid for identifiers
 */
export function isIdentifierChar(ch: string | undefined): ch is string {
  return (
    ch !== undefined &&
    ((ch >= "a" && ch <= "z") ||
      (ch >= "A" && ch <= "Z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "_")
  );
}

/**
 * Check if character is a digit
 */
export function isDigit(ch: string | undefined): ch is string {
  return ch !== undefined && ch >= "0" && ch <= "9";
}

/**
 * Check if a word matches at a given position
 */
export function matchWord(source: string, index: number, word: string): boolean {
  if (index + word.length > source.length) {
    return false;
  }
  return source.slice(index, index + word.length) === word;
}

/**
 * Get character at index, or empty string if out of bounds
 */
export function charAt(source: string, index: number): string {
  if (index >= 0 && index < source.length) {
    return source[index]!;
  }
  return "";
}
