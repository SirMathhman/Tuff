/**
 * Splits Tuff source text into tokens: numbers, brackets, and operators.
 * @param tuffSource - The raw source text.
 * @returns The tokens in source order, with empty strings removed.
 */
export function tokenize(tuffSource: string): string[] {
  return tuffSource
    .replaceAll("\t", " ")
    .replaceAll("(", " ( ")
    .replaceAll(")", " ) ")
    .replaceAll("{", " { ")
    .replaceAll("}", " } ")
    .replaceAll("+", " + ")
    .replaceAll("-", " - ")
    .replaceAll("*", " * ")
    .replaceAll(";", " ; ")
    .split(" ")
    .filter((token) => token !== "");
}
