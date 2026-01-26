import { isIdentifierChar, matchWord } from "../../parsing/string-helpers";
import {
  getStructBracePosition,
  skipStructDeclaration,
} from "../../parsing/struct-helpers";

/**
 * Process identifier to check if it's a struct instantiation
 * Returns new position and result to append
 */
function processIdentifier(
  source: string,
  i: number,
): { newPos: number; isStruct: boolean; identifier: string } {
  const idStart = i;
  while (i < source.length && isIdentifierChar(source[i])) i++;
  const identifier = source.slice(idStart, i);

  // Don't treat control flow keywords or declarations as struct identifiers
  const controlFlowKeywords = [
    "loop",
    "if",
    "while",
    "for",
    "match",
    "else",
    "let",
    "fn",
    "type",
    "struct",
    "module",
    "object",
  ];
  if (controlFlowKeywords.includes(identifier)) {
    return { newPos: i, isStruct: false, identifier };
  }

  // Check if followed by '{'
  const bracePos = getStructBracePosition(source, i);
  if (bracePos !== -1) {
    return { newPos: bracePos, isStruct: true, identifier };
  }

  return { newPos: i, isStruct: false, identifier };
}

/**
 * Transform struct instantiation to object literal
 * e.g., "Point { x: 3, y: 4 }" -> "({ x: 3, y: 4 })"
 *
 * Handles generic structs: "Result<I32> { value: 42 }" -> "({ value: 42 })"
 */
export function transformStructInstantiation(source: string): string {
  let result = "";
  let i = 0;
  let braceDepth = 0;
  let inStructLiteral = false;

  while (i < source.length) {
    // Skip struct declarations completely
    if (matchWord(source, i, "struct")) {
      const start = i;
      i = skipStructDeclaration(source, i);
      result += source.slice(start, i);
      continue;
    }

    // Track brace depth
    if (source[i] === "{") {
      if (inStructLiteral) {
        braceDepth++;
      }
    } else if (source[i] === "}" && inStructLiteral) {
      braceDepth--;
      if (braceDepth === 0) {
        // Closing brace of struct literal - add ) after it
        result += source[i];
        result += ")";
        inStructLiteral = false;
        i++;
        continue;
      }
    }

    // Check if we're at an identifier followed by '{'
    if (
      isIdentifierChar(source[i] ?? "") &&
      !isDigit(source[i] ?? "") &&
      !inStructLiteral
    ) {
      const { newPos, isStruct, identifier } = processIdentifier(source, i);
      i = newPos;

      if (isStruct) {
        // Transform to object literal
        result += "(";
        inStructLiteral = true;
        braceDepth = 0;
        continue;
      } else {
        result += identifier;
        continue;
      }
    }

    result += source[i];
    i++;
  }

  return result;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}
