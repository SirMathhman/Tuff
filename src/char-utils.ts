/**
 * Shared character classification functions.
 * Used by string-utils, parser-utils, tokenizer, parser-declarations, etc.
 * Regex is banned by eslint (no-restricted-syntax) because this is an interpreter.
 */

/** Check if a character is a word character (letter, digit, underscore). */
export function isWordChar(c: string): boolean {
  const code = c.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 // _
  );
}

/** Check if a character is a digit. */
export function isDigit(c: string): boolean {
  const code = c.charCodeAt(0);
  return code >= 48 && code <= 57;
}

/** Check if a character is whitespace. */
export function isSpace(c: string): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r";
}

/** Check if a character is a digit or dot. */
export function isDigitOrDot(c: string): boolean {
  return isDigit(c) || c === ".";
}

/** Check if a character is an ASCII letter. */
export function isAlpha(c: string): boolean {
  const code = c.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/** Check if a character is alphanumeric. */
export function isAlphaNum(c: string): boolean {
  return isAlpha(c) || isDigit(c);
}

/** Check if a character can start a word identifier. */
export function isWordStart(c: string): boolean {
  return isAlpha(c) || c === "_" || c === "$";
}

/** Check if a character can appear in a word identifier. */
export function isWordCharFull(c: string): boolean {
  return isAlphaNum(c) || c === "_" || c === "$";
}

/** Find matching closing paren starting from the position of the opening paren. */
export function findMatchingParen(s: string, openPos: number): number {
  if (openPos >= s.length || s[openPos] !== "(") return -1;
  let depth = 1;
  for (let i = openPos + 1; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Find matching closing bracket from an opening bracket position. */
export function findMatchingBracket(s: string, openPos: number): number {
  if (openPos >= s.length || s[openPos] !== "[") return -1;
  let depth = 1;
  for (let i = openPos + 1; i < s.length; i++) {
    if (s[i] === "[") depth++;
    else if (s[i] === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Check if a word appears as a standalone word in a string. */
export function containsWord(s: string, word: string): boolean {
  return findWord(s, word) !== -1;
}

/** Find a standalone word in a string, returns its start index or -1. */
export function findWord(s: string, word: string): number {
  let i = 0;
  while (i < s.length) {
    const idx = s.indexOf(word, i);
    if (idx === -1) return -1;
    const before = idx === 0 || !isWordChar(s[idx - 1]!);
    const after =
      idx + word.length >= s.length || !isWordChar(s[idx + word.length]!);
    if (before && after) return idx;
    i = idx + 1;
  }
  return -1;
}

/** Split a string by a delimiter, respecting nested brackets/parens/braces. */
export function splitTopLevel(s: string, delimiter: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth === 0 && s.startsWith(delimiter, i)) {
      result.push(s.slice(start, i));
      i += delimiter.length - 1;
      start = i + 1;
    }
  }
  result.push(s.slice(start));
  return result;
}

/** Replace all occurrences of a word with another string. */
export function replaceWord(
  s: string,
  word: string,
  replacement: string,
): string {
  const result: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith(word, i)) {
      const after = i + word.length;
      const isBoundBefore = i === 0 || !isWordChar(s[i - 1]!);
      const isBoundAfter = after >= s.length || !isWordChar(s[after]!);
      if (isBoundBefore && isBoundAfter) {
        result.push(replacement);
        i = after;
        continue;
      }
    }
    result.push(s[i]!);
    i++;
  }
  return result.join("");
}

/** Replace innermost `{...}` blocks in a string using a resolver callback.
 *  Returns the transformed string.
 *  resolver(inner) returns the replacement string, or null to keep the block as-is. */
export function replaceInnermostBlocks(
  s: string,
  resolver: (inner: string) => string | null,
): string {
  const result: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "{") {
      let depth = 1;
      let j = i + 1;
      while (j < s.length && depth > 0) {
        if (s[j] === "{") depth++;
        else if (s[j] === "}") depth--;
        j++;
      }
      if (depth !== 0) {
        result.push(s[i]!);
        i++;
        continue;
      }
      const inner = s.slice(i + 1, j - 1);
      const replacement = resolver(inner);
      if (replacement !== null) result.push(replacement);
      else result.push(s.slice(i, j));
      i = j;
    } else {
      result.push(s[i]!);
      i++;
    }
  }
  return result.join("");
}

/** Check if a trimmed brace content looks like a key:value pattern (object literal). */
export function looksLikeKeyValue(s: string): boolean {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) {
      let k = i - 1;
      while (k >= 0 && (s[k] === " " || s[k] === "\t")) k--;
      if (k >= 0 && isWordChar(s[k]!)) return true;
    }
  }
  return false;
}
