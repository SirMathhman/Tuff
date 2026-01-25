export function isIdentifierChar(ch: string | undefined): boolean {
  if (ch === undefined) return false;
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    (ch >= "0" && ch <= "9") ||
    ch === "_"
  );
}
/**
 * Get character code from an escape sequence character
 * @param escape The character after the backslash in an escape sequence
 * @returns The numeric character code
 * @throws Error if escape sequence is unknown
 */
export function getEscapeCode(escape: string): number {
  switch (escape) {
    case "n":
      return 10; // newline
    case "t":
      return 9; // tab
    case "r":
      return 13; // carriage return
    case "\\":
      return 92; // backslash
    case "'":
      return 39; // single quote
    case '"':
      return 34; // double quote
    default:
      throw new Error(`unknown escape sequence: \\${escape}`);
  }
}
