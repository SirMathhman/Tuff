import {
  isWhitespace,
  matchWord,
  isIdentifierChar,
} from "../parsing/string-helpers";
import {
  transformMatch,
  transformLoop,
  transformWhile,
  transformFor,
} from "./control-flow";
import { transformIfElse } from "./if-else";
import { extractVarDeclarations } from "./var-extraction";

// Re-export for convenience
export { extractVarDeclarations };

/**
 * Skip whitespace in source starting at index
 */
function skipWhitespace(source: string, index: number): number {
  while (index < source.length && isWhitespace(source[index])) index++;
  return index;
}

/**
 * Remove Tuff-specific syntax like let, mut, type annotations
 */
export function removeTypeSyntax(source: string): string {
  let result = "";
  let i = 0;
  let parenDepth = 0;

  while (i < source.length) {
    // Track parentheses/function depth
    if (source[i] === "(") {
      parenDepth++;
    } else if (source[i] === ")") {
      parenDepth--;
    }

    // Skip expression braces only when not inside other constructs and not control flow
    if (
      (source[i] === "{" || source[i] === "}") &&
      parenDepth === 0 &&
      !isProbablyControlFlowBrace(source, i, result)
    ) {
      i++;
      continue;
    }

    // Handle let declarations
    if (matchWord(source, i, "let")) {
      i = skipWhitespace(source, i + 3);
      if (matchWord(source, i, "mut")) i = skipWhitespace(source, i + 3);

      const varStart = i;
      while (i < source.length && isIdentifierChar(source[i])) i++;
      result += source.slice(varStart, i);

      i = skipWhitespace(source, i);
      if (i < source.length && source[i] === ":") {
        i++;
        i = skipWhitespace(source, i);
        while (
          i < source.length &&
          (isIdentifierChar(source[i]) || source[i] === "*")
        )
          i++;
      }
      i = skipWhitespace(source, i);
      continue;
    }

    result += source[i];
    i++;
  }
  return result;
}

/**
 * Check if a brace at position i is probably part of control flow
 */
function isProbablyControlFlowBrace(
  source: string,
  pos: number,
  resultSoFar: string,
): boolean {
  if (source[pos] !== "{") return false;

  // Check if result ends with '(' which would mean this is a control flow brace
  // e.g., "while(cond){" or "for(;;){"
  const trimmed = resultSoFar.trimEnd();
  if (trimmed.endsWith("(")) {
    return true;
  }

  // Check if result ends with a control flow keyword
  const keywords = ["while", "for", "if", "else", "match", "loop"];
  for (const keyword of keywords) {
    const pattern = keyword + "(";
    if (trimmed.endsWith(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Helper to try transform and fallback on failure
 */
function tryTransform(
  keyword: string,
  transform: () => { result: string; endIdx: number } | undefined,
): { success: boolean; result?: string; endIdx?: number } {
  const transformed = transform();
  if (transformed) {
    return {
      success: true,
      result: transformed.result,
      endIdx: transformed.endIdx,
    };
  }
  return { success: false };
}

/**
 * Convert Tuff control flow to JavaScript expressions
 */
/**
 * Try to transform control flow at current position
 */
function tryControlFlowTransform(
  source: string,
  i: number,
): { handled: boolean; result: string; endIdx: number } {
  const transforms: [
    string,
    () => { result: string; endIdx: number } | undefined,
  ][] = [
    ["match", () => transformMatch(source, i)],
    ["loop", () => transformLoop(source, i)],
    ["while", () => transformWhile(source, i)],
    ["for", () => transformFor(source, i)],
    ["if", () => transformIfElse(source, i, transformControlFlow)],
  ];

  for (const [keyword, transform] of transforms) {
    if (matchWord(source, i, keyword)) {
      const { success, result, endIdx } = tryTransform(keyword, transform);
      if (success && endIdx && result !== undefined) {
        return { handled: true, result, endIdx };
      }
    }
  }

  return { handled: false, result: "", endIdx: i };
}

export function transformControlFlow(source: string): string {
  let result = "";
  let i = 0;

  while (i < source.length) {
    const {
      handled,
      result: transformed,
      endIdx,
    } = tryControlFlowTransform(source, i);

    if (handled) {
      result += transformed;
      i = endIdx;
    } else {
      result += source[i];
      i++;
    }
  }

  return result;
}
