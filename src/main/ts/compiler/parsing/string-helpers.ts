/**
 * Check if character is whitespace
 */
export function isWhitespace(ch: string | undefined): ch is string {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

/**
 * Skip whitespace in source starting at index
 */
export function skipWhitespace(source: string, index: number): number {
  let i = index;
  while (i < source.length && isWhitespace(source[i])) i++;
  return i;
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
 * Check if character can start an identifier (not a digit)
 */
export function isIdentifierStartChar(ch: string | undefined): ch is string {
  return ch !== undefined && isIdentifierChar(ch) && !isDigit(ch);
}

/**
 * Check if a word matches at a given position
 */
export function matchWord(
  source: string,
  index: number,
  word: string,
): boolean {
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

/**
 * Skip angle bracket pair and return position after closing >
 * Returns startPos if not starting with <
 */
export function skipAngleBrackets(source: string, startPos: number): number {
  if (startPos >= source.length || source[startPos] !== "<") {
    return startPos;
  }
  let j = startPos + 1;
  let angleDepth = 1;
  while (j < source.length && angleDepth > 0) {
    if (source[j] === "<") angleDepth++;
    else if (source[j] === ">") angleDepth--;
    j++;
  }
  return j;
}

/**
 * Skip whitespace and generic parameters if present
 * Used to skip over type parameters like <T> or <I32>
 */
export function skipWhitespaceAndGenerics(
  source: string,
  startPos: number,
): number {
  const { endPos } = skipWhitespaceAndGenericsWithDetection(source, startPos);
  return endPos;
}

/**
 * Skip whitespace and generic parameters if present
 * Used to skip over type parameters like <T> or <I32>
 * Returns both the new position and whether generics were actually skipped
 */
export function skipWhitespaceAndGenericsWithDetection(
  source: string,
  startPos: number,
): { endPos: number; hadGenerics: boolean } {
  let j = startPos;
  while (j < source.length && isWhitespace(source[j])) j++;
  let hadGenerics = false;
  if (j < source.length && source[j] === "<") {
    j = skipAngleBrackets(source, j);
    while (j < source.length && isWhitespace(source[j])) j++;
    hadGenerics = true;
  }
  return { endPos: j, hadGenerics };
}

export function readIdentifier(
  source: string,
  startIdx: number,
): { name: string; endIdx: number } {
  let i = startIdx;
  while (i < source.length && isIdentifierChar(source[i])) i++;
  return { name: source.slice(startIdx, i), endIdx: i };
}

/**
 * Skip brace pairs and return position after closing }
 * Assumes starting at the opening brace
 */
export function skipBracePair(source: string, startPos: number): number {
  if (startPos >= source.length || source[startPos] !== "{") {
    return startPos;
  }
  let j = startPos + 1;
  let braceDepth = 1;
  while (j < source.length && braceDepth > 0) {
    if (source[j] === "{") braceDepth++;
    else if (source[j] === "}") braceDepth--;
    j++;
  }
  return j;
}
