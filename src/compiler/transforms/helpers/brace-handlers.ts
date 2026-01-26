import {
  isIdentifierChar,
  isWhitespace,
  matchWord,
} from "../../parsing/string-helpers";
import { parseBracedBlock } from "../../parsing/parse-helpers";
import { skipStructDeclaration } from "../../parsing/struct-helpers";

/**
 * Skip whitespace in source starting at index
 */
function skipWhitespace(source: string, index: number): number {
  while (index < source.length && isWhitespace(source[index])) index++;
  return index;
}

/**
 * Check for control flow keywords before parentheses in trimmed string
 */
function checkControlFlowKeywords(
  trimmed: string,
  keywordList: string[],
): boolean {
  for (const keyword of keywordList) {
    const pattern = keyword + "(";
    if (trimmed.endsWith(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Check what keyword precedes closing paren in trimmed string
 */
function checkKeywordBeforeClosingParen(trimmed: string): boolean {
  // Scan back to find the matching ( and check what's before it
  let depth = 1;
  let i = trimmed.length - 2;
  while (i >= 0 && depth > 0) {
    if (trimmed[i] === ")") depth++;
    else if (trimmed[i] === "(") depth--;
    i--;
  }
  // Skip whitespace and check for control flow or function keyword
  while (i >= 0 && isWhitespace(trimmed[i])) i--;

  const keywords = ["while", "for", "if", "else", "match", "loop", "function"];
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
  return false;
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
  if (trimmed.endsWith(")") && checkKeywordBeforeClosingParen(trimmed)) {
    return true;
  }

  // Check if result ends with keyword followed by opening paren
  const keywords = ["while", "for", "if", "else", "match", "loop"];
  if (checkControlFlowKeywords(trimmed, keywords)) {
    return true;
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
type BraceHandleResult = {
  result: string;
  braceDepth: number;
  handled: boolean;
};

function handleBraceInternal(p: {
  source: string;
  pos: number;
  parenDepth: number;
  braceDepth: number;
  result: string;
  kind: "open" | "close";
}): BraceHandleResult | undefined {
  const ch = p.source[p.pos];
  if (p.kind === "open") {
    if (ch !== "{") return undefined;

    const isControlFlow = isProbablyControlFlowBrace(p.source, p.pos, p.result);
    if (isControlFlow) {
      return {
        result: p.result + ch,
        braceDepth: p.braceDepth + 1,
        handled: true,
      };
    }

    if (p.parenDepth > 0) {
      return {
        result: p.result + "(",
        braceDepth: p.braceDepth,
        handled: true,
      };
    }

    return { result: p.result, braceDepth: p.braceDepth, handled: true };
  }

  if (ch !== "}") return undefined;
  if (p.braceDepth > 0) {
    return {
      result: p.result + ch,
      braceDepth: p.braceDepth - 1,
      handled: true,
    };
  }

  if (p.parenDepth > 0) {
    return { result: p.result + ")", braceDepth: p.braceDepth, handled: true };
  }

  return { result: p.result, braceDepth: p.braceDepth, handled: true };
}

export const handleOpeningBrace = (
  source: string,
  pos: number,
  parenDepth: number,
  braceDepth: number,
  result: string,
): BraceHandleResult | undefined =>
  handleBraceInternal({
    source,
    pos,
    parenDepth,
    braceDepth,
    result,
    kind: "open",
  });

/**
 * Handle closing braces with brace depth tracking
 */
export function handleClosingBrace(
  source: string,
  pos: number,
  parenDepth: number,
  braceDepth: number,
  result: string,
): BraceHandleResult | undefined {
  return handleBraceInternal({
    source,
    pos,
    parenDepth,
    braceDepth,
    result,
    kind: "close",
  });
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
    const { endIdx } = parseBracedBlock(source, i);
    // Keep the destructuring pattern as-is
    result += source.slice(i, endIdx);
    i = endIdx;
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
