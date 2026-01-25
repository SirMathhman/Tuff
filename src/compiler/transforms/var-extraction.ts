import {
  isWhitespace,
  isIdentifierChar,
  isDigit,
  charAt,
} from "../parsing/string-helpers";

/**
 * Skip whitespace in source starting at index
 */
function skipWhitespace(source: string, index: number): number {
  while (index < source.length && isWhitespace(source[index])) index++;
  return index;
}

/**
 * JS keywords to skip when extracting var declarations
 */
const JS_KEYWORDS = new Set([
  "let",
  "var",
  "const",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "return",
  "function",
  "class",
]);

const JS_RESERVED_WORDS = new Set([
  ...JS_KEYWORDS,
  "true",
  "false",
  "try",
  "catch",
  "finally",
  "throw",
  "new",
  "this",
  "in",
  "of",
  "default",
]);

/**
 * Check if identifier is a variable assignment (not keyword, followed by =)
 */
function isVarAssignment(
  name: string,
  source: string,
  nextIdx: number,
): boolean {
  return (
    !JS_KEYWORDS.has(name) &&
    nextIdx < source.length &&
    source[nextIdx] === "=" &&
    charAt(source, nextIdx + 1) !== "="
  );
}

interface DestructuringInfo {
  vars: string[];
  endIdx: number;
}

/**
 * Try to extract variables from destructuring pattern like { x, y } = value
 */
function tryExtractDestructuringVars(
  source: string,
  i: number,
): DestructuringInfo | undefined {
  if (source[i] !== "{") return undefined;

  const vars: string[] = [];
  let j = i + 1;
  let braceDepth = 1;

  while (j < source.length && braceDepth > 0) {
    const ch = source[j];
    if (ch === "{") {
      braceDepth++;
      j++;
      continue;
    }
    if (ch === "}") {
      braceDepth--;
      j++;
      continue;
    }

    if (braceDepth === 1 && isIdentifierChar(ch) && !isDigit(ch)) {
      const varStart = j;
      while (j < source.length && isIdentifierChar(source[j])) j++;
      const varName = source.slice(varStart, j);
      if (!JS_RESERVED_WORDS.has(varName)) vars.push(varName);
      continue;
    }

    j++;
  }

  if (braceDepth !== 0) return undefined;
  const afterBrace = skipWhitespace(source, j);
  if (afterBrace >= source.length || source[afterBrace] !== "=")
    return undefined;
  return { vars, endIdx: afterBrace + 1 };
}

function takeIdentifier(
  source: string,
  start: number,
): { name: string; endIdx: number } {
  let i = start;
  while (i < source.length && isIdentifierChar(source[i])) i++;
  return { name: source.slice(start, i), endIdx: i };
}

/**
 * Extract variable declarations from compiled JavaScript
 */
export function extractVarDeclarations(source: string): {
  expression: string;
  varDeclarations: string[];
} {
  const varDeclDecls = new Set<string>();
  let result = "";
  let i = 0;
  let braceDepth = 0;

  while (i < source.length) {
    const ch = source[i];
    if (isWhitespace(ch)) {
      result += ch;
      i++;
      continue;
    }

    // Check for destructuring pattern at top level
    if (ch === "{" && braceDepth === 0) {
      const destruct = tryExtractDestructuringVars(source, i);
      if (destruct) {
        destruct.vars.forEach((v) => varDeclDecls.add(v));
        result += source[i];
        i++;
        continue;
      }
    }

    // Track brace depth to know if we're inside a function body
    if (ch === "{") {
      braceDepth++;
      result += ch;
      i++;
      continue;
    }
    if (ch === "}") {
      braceDepth--;
      result += ch;
      i++;
      continue;
    }

    if (isIdentifierChar(ch) && !isDigit(ch)) {
      const { name, endIdx } = takeIdentifier(source, i);
      const nextIdx = skipWhitespace(source, endIdx);
      const isAssignment = isVarAssignment(name, source, nextIdx);
      if (isAssignment) varDeclDecls.add(name);
      result += name;
      i = isAssignment ? nextIdx : endIdx;
      continue;
    }

    result += ch;
    i++;
  }

  return { expression: result, varDeclarations: Array.from(varDeclDecls) };
}
