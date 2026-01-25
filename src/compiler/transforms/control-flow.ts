import { isWhitespace, matchWord } from "../parsing/string-helpers";
import {
  parseCondition,
  parseBody,
  parseUntilSemicolon,
} from "../parsing/parse-helpers";
import { transformFor, transformBreakInLoop } from "./for-loop";

// Re-export for convenience
export { transformFor };

/**
 * Skip whitespace in source starting at index
 */
function skipWhitespace(source: string, index: number): number {
  while (index < source.length && isWhitespace(source[index])) index++;
  return index;
}

/**
 * Parse match cases and generate if-else chain code
 */
function parseMatchCases(casesContent: string): string {
  let casesCode = "";
  let caseIdx = 0;
  let j = 0;

  while (j < casesContent.length) {
    while (j < casesContent.length && isWhitespace(casesContent[j])) j++;
    if (j >= casesContent.length) break;

    if (matchWord(casesContent, j, "case")) {
      j = skipWhitespace(casesContent, j + 4);

      const patternStart = j;
      while (
        j < casesContent.length &&
        casesContent[j] !== "=" &&
        casesContent[j] !== ";"
      )
        j++;
      const pattern = casesContent.slice(patternStart, j).trim();

      j = skipWhitespace(casesContent, j);
      if (j < casesContent.length && casesContent[j] === "=") {
        j = skipWhitespace(casesContent, j + 1);
        if (j < casesContent.length && casesContent[j] === ">")
          j = skipWhitespace(casesContent, j + 1);
      }

      const { content: value, endIdx: valueEndIdx } = parseUntilSemicolon(
        casesContent,
        j,
      );
      j = valueEndIdx;
      if (j < casesContent.length && casesContent[j] === ";") j++;

      if (caseIdx > 0) casesCode += " else ";
      if (pattern === "_") {
        casesCode += `{ return ${value}; }`;
      } else {
        casesCode += `if (__match_expr === ${pattern}) { return ${value}; }`;
      }
      caseIdx++;
    } else {
      j++;
    }
  }

  return casesCode;
}

/**
 * Transform match expression to IIFE with if-else chain
 */
export function transformMatch(
  source: string,
  startIdx: number,
): { result: string; endIdx: number } | undefined {
  let i = skipWhitespace(source, startIdx + 5);
  if (i >= source.length || source[i] !== "(") return undefined;

  i++;
  let depth = 1;
  const valueStart = i;
  while (i < source.length && depth > 0) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") depth--;
    i++;
  }
  const matchValue = source.slice(valueStart, i - 1).trim();
  i = skipWhitespace(source, i);

  if (i >= source.length || source[i] !== "{") return undefined;

  i++;
  depth = 1;
  const casesStart = i;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }
  const casesContent = source.slice(casesStart, i - 1).trim();
  const casesCode = parseMatchCases(casesContent);

  const result = `(function() { let __match_expr = ${matchValue}; ${casesCode} return 0; })();`;
  return { result, endIdx: i };
}

/**
 * Transform loop { ... } to IIFE with while and exception handling
 */
export function transformLoop(
  source: string,
  startIdx: number,
): { result: string; endIdx: number } | undefined {
  let i = skipWhitespace(source, startIdx + 4);
  if (i >= source.length || source[i] !== "{") return undefined;

  i++;
  let depth = 1;
  const bodyStart = i;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }
  let bodyContent = source.slice(bodyStart, i - 1).trim();
  bodyContent = transformBreakInLoop(bodyContent);

  const result = `(function() { let __break_value = 0; let __break_flag = false; while(!__break_flag) { try { ${bodyContent} } catch(__e__) { if (__e__ === "__break__") __break_flag = true; else throw __e__; } } return __break_value; })()`;
  return { result, endIdx: i };
}

/**
 * Transform while (cond) expr to while loop expression
 */
export function transformWhile(
  source: string,
  startIdx: number,
): { result: string; endIdx: number } | undefined {
  let i = skipWhitespace(source, startIdx + 5);
  if (i >= source.length || source[i] !== "(") return undefined;

  const { condition, endIdx: condEndIdx } = parseCondition(source, i);
  i = skipWhitespace(source, condEndIdx);

  const { body, endIdx } = parseBody(source, i);
  const result = `(function() { while(${condition}) { ${body}; } return 0; })()`;
  return { result, endIdx };
}
