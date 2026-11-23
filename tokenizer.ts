/**
 * Splits Tuff source text into tokens: numbers, brackets, and operators.
 * @param tuffSource - The raw source text.
 * @returns The tokens in source order, with empty strings removed.
 */
export function tokenize(tuffSource: string): string[] {
  return tuffSource
    .replaceAll("\t", " ")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ")
    .replaceAll("(", " ( ")
    .replaceAll(")", " ) ")
    .replaceAll("{", " { ")
    .replaceAll("}", " } ")
    .replaceAll("+", " + ")
    .replaceAll("-", " - ")
    .replaceAll("*", " * ")
    .replaceAll(";", " ; ")
    .replaceAll("=", " = ")
    .split(" ")
    .filter((token) => token !== "");
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
