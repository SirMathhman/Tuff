import {
  matchWord,
  skipWhitespaceAndGenerics,
} from "./string-helpers";

/**
 * Skip a struct declaration from position i (at 'struct' keyword)
 * Returns the position after the closing brace
 */
export function skipStructDeclaration(source: string, i: number): number {
  if (!matchWord(source, i, "struct")) return -1;

  // Skip to the closing brace
  let braceDepth = 0;
  let foundBrace = false;
  while (i < source.length) {
    if (source[i] === "{") {
      braceDepth++;
      foundBrace = true;
    } else if (source[i] === "}") {
      braceDepth--;
      if (foundBrace && braceDepth === 0) {
        i++;
        break;
      }
    }
    i++;
  }
  return i;
}

/**
 * Check if identifier at position i is followed by braces (struct instantiation),
 * accounting for generic parameters.
 * Returns the position of the opening brace, or -1 if not a struct instantiation.
 */
export function getStructBracePosition(
  source: string,
  identifierEnd: number,
): number {
  const j = skipWhitespaceAndGenerics(source, identifierEnd);
  // Check if followed by '{'
  return j < source.length && source[j] === "{" ? j : -1;
}

/**
 * Check if identifier at position i is followed by braces (struct instantiation),
 * accounting for generic parameters
 */
export function isStructInstantiation(
  source: string,
  identifierEnd: number,
): boolean {
  return getStructBracePosition(source, identifierEnd) !== -1;
}
