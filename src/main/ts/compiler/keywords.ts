/**
 * List of reserved keywords in Tuff
 */
export const TUFF_KEYWORDS = [
  "let",
  "mut",
  "if",
  "else",
  "return",
  "fn",
  "for",
  "while",
  "loop",
  "break",
  "continue",
  "match",
  "type",
  "struct",
  "module",
  "true",
  "false",
] as const;

/**
 * Check if a word is a keyword
 */
export function isKeyword(word: string): boolean {
  return (TUFF_KEYWORDS as readonly string[]).includes(word);
}
