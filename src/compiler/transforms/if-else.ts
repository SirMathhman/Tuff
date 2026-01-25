import { isWhitespace, matchWord } from "../parsing/string-helpers";
import {
  parseCondition,
  parseBracedBlock,
  parseSingleExpression,
} from "../parsing/parse-helpers";

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
