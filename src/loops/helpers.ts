/**
 * Find the position of the closing parenthesis matching the opening one at startIdx
 * Returns the position of the closing paren, or -1 if not found
 */
export function findClosingParenthesis(s: string, startIdx: number): number {
  let parenDepth = 1;
  let idx = startIdx + 1;

  while (idx < s.length && parenDepth > 0) {
    if (s[idx] === "(") parenDepth++;
    else if (s[idx] === ")") parenDepth--;
    if (parenDepth > 0) idx++;
  }

  return parenDepth === 0 ? idx : -1;
}

/**
 * Find the position of the closing brace matching the opening one at startIdx
 * Returns the position of the closing brace, or -1 if not found
 */
export function findClosingBrace(s: string, startIdx: number): number {
  let braceDepth = 1;
  let idx = startIdx + 1;

  while (idx < s.length && braceDepth > 0) {
    if (s[idx] === "{") braceDepth++;
    else if (s[idx] === "}") braceDepth--;
    if (braceDepth > 0) idx++;
  }

  return braceDepth === 0 ? idx : -1;
}
export interface BodyParseResult {
  body: string;
  nextIdx: number;
}

export function parseLoopBody(
  s: string,
  startIdx: number,
): BodyParseResult | undefined {
  let idx = startIdx;

  // Skip whitespace
  while (idx < s.length && s[idx] === " ") idx++;

  let loopBody: string;

  if (idx < s.length && s[idx] === "{") {
    // Braced body
    const bodyEnd = findClosingBrace(s, idx);
    if (bodyEnd === -1) return undefined;

    loopBody = s.slice(idx + 1, bodyEnd).trim();
    idx = bodyEnd + 1;
  } else {
    // Non-braced body - find the semicolon
    const semiIdx = s.indexOf(";", idx);
    if (semiIdx === -1) return undefined;
    loopBody = s.slice(idx, semiIdx + 1);
    idx = semiIdx + 1;
  }

  return { body: loopBody, nextIdx: idx };
}
