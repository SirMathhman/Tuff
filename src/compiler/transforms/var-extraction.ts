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
  let braceDepth = 0;

  while (i < source.length) {
    const ch = source[i];
    if (isWhitespace(ch)) {
      result += ch;
      i++;
      continue;
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

    // Extract var assignments
    if (isIdentifierChar(ch) && !isDigit(ch)) {
      const nameStart = i;
      while (i < source.length && isIdentifierChar(source[i])) i++;
      const name = source.slice(nameStart, i);

      const nextIdx = skipWhitespace(source, i);

      // Check if this is a const/let declaration inside braces (skip extraction)
      // or a bare assignment at any depth (extract)
      if (isVarAssignment(name, source, nextIdx)) {
        const isConstOrLet = name === "const" || name === "let";

        // Skip const/let declarations inside braces, extract everything else
        if (!(isConstOrLet && braceDepth > 0)) {
          varDeclDecls.add(name);
        }

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
