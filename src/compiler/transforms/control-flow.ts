import { isWhitespace, matchWord } from "../parsing/string-helpers";
import {
  parseCondition,
  parseBody,
  parseUntilSemicolon,
  parseBracedBlock,
  parseSingleExpression,
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
 * Find the end of an else-if chain
 */
function findElseIfEnd(source: string, startIdx: number): number {
  let j = startIdx;
  let parenDepth = 0;
  let braceDepth = 0;

  while (j < source.length) {
    if (source[j] === "(") parenDepth++;
    else if (source[j] === ")") parenDepth--;
    else if (source[j] === "{") braceDepth++;
    else if (source[j] === "}") braceDepth--;
    else if (
      (source[j] === ";" || source[j] === ",") &&
      parenDepth === 0 &&
      braceDepth === 0
    )
      break;
    j++;
  }

  return j;
}

/**
 * Transform if-else to ternary operator
 * Handles nested if-else-if-else chains
 */
export function transformIfElse(
  source: string,
  startIdx: number,
  transformControlFlow: (src: string) => string,
): { result: string; endIdx: number } | undefined {
  let i = skipWhitespace(source, startIdx + 2);
  if (i >= source.length || source[i] !== "(") return undefined;

  const { condition, endIdx: ifCondEndIdx } = parseCondition(source, i);
  i = skipWhitespace(source, ifCondEndIdx);

  let trueBranch = "";
  if (i < source.length && source[i] === "{") {
    const { content, endIdx: braceEndIdx } = parseBracedBlock(source, i);
    trueBranch = content;
    i = braceEndIdx;
  } else {
    const { expression, endIdx: exprEndIdx } = parseSingleExpression(
      source,
      i,
      "else",
    );
    trueBranch = expression;
    i = exprEndIdx;
  }

  i = skipWhitespace(source, i);
  let falseBranch = "0";
  if (i < source.length && matchWord(source, i, "else")) {
    i = skipWhitespace(source, i + 4);

    if (i < source.length && matchWord(source, i, "if")) {
      const j = findElseIfEnd(source, i);
      const nestedTransformed = transformControlFlow(source.slice(i, j));
      falseBranch = nestedTransformed;
      i = j;
    } else if (i < source.length && source[i] === "{") {
      const { content, endIdx: elseEndIdx } = parseBracedBlock(source, i);
      falseBranch = content;
      i = elseEndIdx;
    } else {
      const { expression, endIdx: elseSingleEndIdx } = parseSingleExpression(
        source,
        i,
      );
      falseBranch = expression;
      i = elseSingleEndIdx;
    }
  }

  const result = `(${condition} ? ${trueBranch} : ${falseBranch})`;
  return { result, endIdx: i };
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
