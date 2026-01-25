import {
  isIdentifierChar,
  isWhitespace,
  matchWord,
} from "../../parsing/string-helpers";

/**
 * Skip whitespace in source starting at index
 */
function skipWhitespace(source: string, index: number): number {
  while (index < source.length && isWhitespace(source[index])) index++;
  return index;
}

/**
 * Check if a brace at position i is probably part of control flow or function body
 */
export function isProbablyControlFlowBrace(
  source: string,
  pos: number,
  resultSoFar: string,
): boolean {
  if (source[pos] !== "{") return false;

  const trimmed = resultSoFar.trimEnd();

  // Check if result ends with '=>' which means this is a function body
  if (trimmed.endsWith("=>")) {
    return true;
  }

  // Check if result ends with 'return' which means this is a return object literal
  if (trimmed.endsWith("return")) {
    return true;
  }

  // Check if result ends with '(' which would mean this is a control flow brace
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
 * Handle opening braces with brace depth tracking
 */
export function handleOpeningBrace(
  source: string,
  pos: number,
  parenDepth: number,
  braceDepth: number,
  result: string,
): { result: string; braceDepth: number; handled: boolean } | undefined {
  if (source[pos] !== "{" || parenDepth !== 0) return undefined;

  const isControlFlow = isProbablyControlFlowBrace(source, pos, result);

  // Only skip if this is an expression brace at the top level
  if (!isControlFlow && braceDepth === 0) {
    return { result, braceDepth, handled: true }; // Skip and increment idx in caller
  }

  // Keep this brace
  return {
    result: result + source[pos],
    braceDepth: braceDepth + 1,
    handled: true,
  };
}

/**
 * Handle closing braces with brace depth tracking
 */
export function handleClosingBrace(
  source: string,
  pos: number,
  parenDepth: number,
  braceDepth: number,
  result: string,
): { result: string; braceDepth: number; handled: boolean } | undefined {
  if (source[pos] !== "}") return undefined;

  // If we're inside braces (braceDepth > 0), always keep the closing brace
  if (braceDepth > 0) {
    return {
      result: result + source[pos],
      braceDepth: braceDepth - 1,
      handled: true,
    };
  }

  // At top level, skip expression braces
  if (
    braceDepth === 0 &&
    parenDepth === 0 &&
    !isProbablyControlFlowBrace(source, pos, result)
  ) {
    return { result, braceDepth, handled: true }; // Skip
  }

  return undefined; // Don't handle this case
}

/**
 * Handle let declarations
 */
export function handleLetDeclaration(
  source: string,
  i: number,
): { result: string; endIdx: number } {
  let result = "";
  i = skipWhitespace(source, i + 3);
  if (matchWord(source, i, "mut")) i = skipWhitespace(source, i + 3);
  const varStart = i;
  while (i < source.length && isIdentifierChar(source[i])) i++;
  result += source.slice(varStart, i);
  i = skipWhitespace(source, i);
  if (i < source.length && source[i] === ":") {
    i++;
    i = skipWhitespace(source, i);
    let parenDepth = 0;
    while (i < source.length) {
      if (source[i] === "(") parenDepth++;
      else if (source[i] === ")") parenDepth--;
      else if (
        parenDepth === 0 &&
        source[i] === "=" &&
        (i + 1 >= source.length || source[i + 1] !== ">")
      ) {
        break;
      }
      i++;
    }
  }
  return { result, endIdx: skipWhitespace(source, i) };
}
