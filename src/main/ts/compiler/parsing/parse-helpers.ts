import { matchWord } from "./string-helpers";

/**
 * Core depth-tracking loop for parsing nested structures
 * Returns the index where the stop condition is met
 */
function trackDepthUntil(
  source: string,
  startIdx: number,
  stopCondition: (i: number, depth: number) => boolean,
): number {
  let depth = 0;
  const start = startIdx;
  let i = start;

  while (i < source.length) {
    if (source[i] === "{" || source[i] === "[" || source[i] === "(") depth++;
    else if (source[i] === "}" || source[i] === "]" || source[i] === ")")
      depth--;

    if (stopCondition(i, depth)) break;
    i++;
  }

  return i;
}

/**
 * Parse a condition wrapped in parentheses
 * Returns the condition string and the index after the closing paren
 */
export function parseCondition(
  source: string,
  startIdx: number,
): { condition: string; endIdx: number } {
  let i = startIdx;
  if (i >= source.length || source[i] !== "(") {
    throw new Error("Expected opening parenthesis for condition");
  }

  i++; // skip opening (
  let depth = 1;
  const condStart = i;
  while (i < source.length && depth > 0) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") depth--;
    i++;
  }
  const condition = source.slice(condStart, i - 1).trim();
  return { condition, endIdx: i };
}

/**
 * Parse a single expression until a terminator (like else, semicolon, etc)
 * Respects depth for nested structures
 */
export function parseSingleExpression(
  source: string,
  startIdx: number,
  stopWord?: string,
): { expression: string; endIdx: number } {
  const exprStart = startIdx;
  const endIdx = trackDepthUntil(source, startIdx, (i, depth) => {
    if (depth === 0) {
      if (stopWord && matchWord(source, i, stopWord)) return true;
      if (source[i] === ";" || source[i] === ",") return true;
    }
    return false;
  });

  return { expression: source.slice(exprStart, endIdx).trim(), endIdx };
}

/**
 * Parse a braced block { ... }
 * Returns the content and the index after the closing brace
 */
export function parseBracedBlock(
  source: string,
  startIdx: number,
): { content: string; endIdx: number } {
  let i = startIdx;
  if (i >= source.length || source[i] !== "{") {
    throw new Error("Expected opening brace");
  }

  i++; // skip opening {
  let depth = 1;
  const contentStart = i;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }

  return { content: source.slice(contentStart, i - 1).trim(), endIdx: i };
}

/**
 * Parse until semicolon at depth 0
 * Used for finding the end of statements
 */
export function parseUntilSemicolon(
  source: string,
  startIdx: number,
): { content: string; endIdx: number } {
  const contentStart = startIdx;
  const endIdx = trackDepthUntil(
    source,
    startIdx,
    (i, depth) => source[i] === ";" && depth === 0,
  );

  return { content: source.slice(contentStart, endIdx).trim(), endIdx };
}

/**
 * Parse a body that can be either braced { ... } or a single statement
 * Used by control flow handlers that accept both forms
 */
export function parseBody(
  source: string,
  startIdx: number,
): { body: string; endIdx: number } {
  const i = startIdx;
  if (i < source.length && source[i] === "{") {
    const { content, endIdx } = parseBracedBlock(source, i);
    return { body: content, endIdx };
  }

  // Single statement/expression - parse until terminator
  const { expression, endIdx } = parseSingleExpression(source, i);
  return { body: expression, endIdx };
}
