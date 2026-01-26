import {
  isIdentifierChar,
  isWhitespace,
  matchWord,
} from "../../parsing/string-helpers";
import { skipStructDeclaration } from "../../parsing/struct-helpers";

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

  // Check if result ends with '=' which means this is an object literal assignment
  // e.g., const Sample = { ... }
  if (trimmed.endsWith("=")) {
    return true;
  }

  // Check if result ends with '(' which means this is an object literal wrapped in parens
  // e.g., from struct transform: ({ x: 3, y: 4 })
  if (trimmed.endsWith("(")) {
    return true;
  }

  // Check if result ends with ')' preceded by control flow keyword + condition
  // or function declaration. e.g., while(...), if (...), function()
  if (trimmed.endsWith(")")) {
    // Scan back to find the matching ( and check what's before it
    let depth = 1;
    let i = trimmed.length - 2;
    while (i >= 0 && depth > 0) {
      if (trimmed[i] === ")") depth++;
      else if (trimmed[i] === "(") depth--;
      i--;
    }
    // Now i points to just before the opening (
    // Skip whitespace and check for control flow or function keyword
    while (i >= 0 && isWhitespace(trimmed[i])) i--;

    // Check what word is before the (
    const keywords = [
      "while",
      "for",
      "if",
      "else",
      "match",
      "loop",
      "function",
    ];
    for (const keyword of keywords) {
      const start = i - keyword.length + 1;
      if (start >= 0) {
        const word = trimmed.slice(start, i + 1);
        if (
          word === keyword &&
          (start === 0 || !isIdentifierChar(trimmed[start - 1]))
        ) {
          return true;
        }
      }
    }
  }

  // Check if result ends with keyword followed by opening paren (legacy check)
  const keywords = ["while", "for", "if", "else", "match", "loop"];
  for (const keyword of keywords) {
    const pattern = keyword + "(";
    if (trimmed.endsWith(pattern)) {
      return true;
    }
  }

  // Check for 'try' block
  if (trimmed.endsWith("try")) {
    return true;
  }

  // Check for 'catch(...)' pattern
  if (trimmed.endsWith(")")) {
    // Check for catch keyword before the parens
    const catchIdx = trimmed.lastIndexOf("catch");
    if (catchIdx !== -1 && catchIdx > trimmed.lastIndexOf(")") - 20) {
      return true;
    }
  }

  // Check for 'else' before brace (e.g., "else {")
  if (trimmed.endsWith("else")) {
    return true;
  }

  return false;
}

/**
 * Handle opening braces with brace depth tracking
 * For expression braces (not control flow), convert { to (
 */
export function handleOpeningBrace(
  source: string,
  pos: number,
  parenDepth: number,
  braceDepth: number,
  result: string,
): { result: string; braceDepth: number; handled: boolean } | undefined {
  if (source[pos] !== "{") return undefined;

  const isControlFlow = isProbablyControlFlowBrace(source, pos, result);

  // For control flow braces, keep them
  if (isControlFlow) {
    return {
      result: result + source[pos],
      braceDepth: braceDepth + 1,
      handled: true,
    };
  }

  // For expression braces, convert to parentheses (skip the brace, we'll add paren)
  // If at top level, just skip. If inside parens, convert to (
  if (parenDepth > 0) {
    // Inside an expression like (2 + { ... }), convert { to (
    return { result: result + "(", braceDepth, handled: true };
  }

  // Top level expression brace, just skip
  return { result, braceDepth, handled: true };
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

  // At brace depth 0 - this is an expression brace
  // If inside parens, convert } to )
  if (parenDepth > 0) {
    return { result: result + ")", braceDepth, handled: true };
  }

  // Top level expression brace, just skip
  return { result, braceDepth, handled: true };
}

/**
 * Handle let declarations (including destructuring patterns)
 */
export function handleLetDeclaration(
  source: string,
  i: number,
): { result: string; endIdx: number } {
  let result = "";
  i = skipWhitespace(source, i + 3);
  if (matchWord(source, i, "mut")) i = skipWhitespace(source, i + 3);

  // Check for destructuring pattern: let { x, y } = ...
  if (source[i] === "{") {
    // Find matching close brace
    let braceDepth = 1;
    let j = i + 1;
    while (j < source.length && braceDepth > 0) {
      if (source[j] === "{") braceDepth++;
      else if (source[j] === "}") braceDepth--;
      j++;
    }
    // Keep the destructuring pattern as-is
    result += source.slice(i, j);
    i = j;
  } else {
    // Regular variable declaration
    const varStart = i;
    while (i < source.length && isIdentifierChar(source[i])) i++;
    result += source.slice(varStart, i);
  }

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

/**
 * Handle type declarations - skip them entirely as they're compile-time only
 * e.g., "type MyAlias = I32;" gets stripped completely
 */
export function handleTypeDeclaration(
  source: string,
  i: number,
): { result: string; endIdx: number } | undefined {
  if (!matchWord(source, i, "type")) return undefined;
  // Skip to the semicolon
  while (i < source.length && source[i] !== ";") i++;
  if (i < source.length && source[i] === ";") i++;
  return { result: "", endIdx: i };
}

/**
 * Handle struct declarations - skip them entirely as they're compile-time only
 * e.g., "struct Point { x: I32, y: I32 }" gets stripped completely
 */
export function handleStructDeclaration(
  source: string,
  i: number,
): { result: string; endIdx: number } | undefined {
  const endIdx = skipStructDeclaration(source, i);
  if (endIdx === -1) return undefined;
  return { result: "", endIdx };
}
