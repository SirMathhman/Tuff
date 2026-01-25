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

  while (i < source.length) {
    const ch = source[i];
    if (isWhitespace(ch)) {
      result += ch;
      i++;
      continue;
    }

    if (isIdentifierChar(ch) && !isDigit(ch)) {
      const nameStart = i;
      while (i < source.length && isIdentifierChar(source[i])) i++;
      const name = source.slice(nameStart, i);

      const nextIdx = skipWhitespace(source, i);
      if (isVarAssignment(name, source, nextIdx)) {
        varDeclDecls.add(name);
        result += name;
        i = nextIdx;
      } else {
        result += name;
      }
      continue;
    }

    result += ch;
    i++;
  }

  return { expression: result, varDeclarations: Array.from(varDeclDecls) };
}
