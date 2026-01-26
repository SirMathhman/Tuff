/**
 * Identify variables that are targets of pointer operations (&x)
 * These variables need to be wrapped in arrays to work with pointer semantics
 */

import {
  isWhitespace,
  isIdentifierStartChar,
  isIdentifierChar,
} from "../../parsing/string-helpers";

export function findPointerTargets(source: string): Set<string> {
  const targets = new Set<string>();

  // Look for patterns: &<identifier>
  let pos = 0;
  while (pos < source.length) {
    if (source[pos] === "&" && pos + 1 < source.length) {
      // Make sure this is a reference operation (not part of && or something)
      if (pos > 0 && source[pos - 1] === "&") {
        // This is && (logical AND), skip
        pos++;
        continue;
      }

      // Extract the identifier after &
      let idStart = pos + 1;
      // Skip whitespace
      while (idStart < source.length && isWhitespace(source[idStart]!)) {
        idStart++;
      }

      if (idStart < source.length && isIdentifierStartChar(source[idStart]!)) {
        let idEnd = idStart;
        while (idEnd < source.length && isIdentifierChar(source[idEnd]!)) {
          idEnd++;
        }

        const varName = source.slice(idStart, idEnd);
        targets.add(varName);
      }
    }

    pos++;
  }

  return targets;
}
