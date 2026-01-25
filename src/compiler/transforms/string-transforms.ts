import { isWhitespace, isIdentifierChar } from "../parsing/string-helpers";

/**
 * Check if we're in string indexing context (not variable indexing)
 */
function isStringIndexingContext(source: string, bracketPos: number): boolean {
  if (bracketPos === 0) return false;
  let i = bracketPos - 1;
  while (i >= 0 && isWhitespace(source[i])) {
    i--;
  }
  if (i < 0) return false;
  return source[i] === '"';
}

/**
 * Extract and validate a string literal's content
 */
function extractStringContent(
  source: string,
  startIdx: number,
): {
  content: string;
  endIdx: number;
} {
  let j = startIdx + 1;
  let content = "";
  while (j < source.length && source[j] !== '"') {
    if (source[j] === "\\" && j + 1 < source.length) {
      const escape = source[j + 1];
      switch (escape) {
        case "n":
          content += "\n";
          break;
        case "t":
          content += "\t";
          break;
        case "r":
          content += "\r";
          break;
        case "\\":
          content += "\\";
          break;
        case '"':
          content += '"';
          break;
        case "'":
          content += "'";
          break;
        default:
          content += source.slice(j, j + 2);
      }
      j += 2;
    } else {
      content += source[j];
      j++;
    }
  }
  return { content, endIdx: j < source.length ? j + 1 : j };
}

/**
 * Validate constant string index and return validated expression
 */
function validateStringIndex(indexExpr: string, stringLength: number): string {
  const indexNum = Number(indexExpr);
  if (Number.isFinite(indexNum) && indexNum === Math.floor(indexNum)) {
    if (indexNum < 0 || indexNum >= stringLength) {
      throw new Error(
        `string index ${indexNum} out of bounds (string length: ${stringLength})`,
      );
    }
  }
  return indexExpr;
}

/**
 * Find the closing bracket and extract index expression
 */
function findIndexBracketEnd(source: string, startPos: number): number {
  let j = startPos + 1;
  let depth = 0;
  while (j < source.length) {
    if (source[j] === "[") depth++;
    else if (source[j] === "]") {
      if (depth === 0) break;
      depth--;
    }
    j++;
  }
  return j;
}

/**
 * Process string literal followed by indexing
 */
function processStringIndexing(
  source: string,
  startPos: number,
  content: string,
  endIdx: number,
): { output: string; nextPos: number } {
  let k = endIdx;
  while (k < source.length && isWhitespace(source[k])) k++;

  if (k >= source.length || source[k] !== "[") {
    return { output: source.slice(startPos, endIdx), nextPos: endIdx };
  }

  const bracketEnd = findIndexBracketEnd(source, k);
  if (bracketEnd >= source.length) {
    return { output: source[k]!, nextPos: k + 1 };
  }

  const indexExpr = source.slice(k + 1, bracketEnd).trim();
  const validExpr = validateStringIndex(indexExpr, content.length);
  const stringWithIndex =
    source.slice(startPos, endIdx) + `.charCodeAt(${validExpr})`;
  return { output: stringWithIndex, nextPos: bracketEnd + 1 };
}

/**
 * Process variable indexing like x[0]
 * Skip charCodeAt for array variables - keep as x[i]
 */
function processVariableIndexing(
  source: string,
  bracketPos: number,
  arrayVars: Set<string>,
): { output: string; nextPos: number; skipped: boolean } {
  // Find the variable name before the bracket
  let varEnd = bracketPos - 1;
  while (varEnd >= 0 && isWhitespace(source[varEnd])) varEnd--;
  let varStart = varEnd;
  while (varStart > 0 && isIdentifierChar(source[varStart - 1])) varStart--;
  const varName = source.slice(varStart, varEnd + 1);

  // If it's an array variable, don't convert to charCodeAt
  if (arrayVars.has(varName)) {
    const bracketEnd = findIndexBracketEnd(source, bracketPos);
    if (bracketEnd >= source.length) {
      return {
        output: source[bracketPos]!,
        nextPos: bracketPos + 1,
        skipped: true,
      };
    }
    return {
      output: source.slice(bracketPos, bracketEnd + 1),
      nextPos: bracketEnd + 1,
      skipped: true,
    };
  }

  const bracketEnd = findIndexBracketEnd(source, bracketPos);
  if (bracketEnd >= source.length) {
    return {
      output: source[bracketPos]!,
      nextPos: bracketPos + 1,
      skipped: false,
    };
  }

  const indexExpr = source.slice(bracketPos + 1, bracketEnd).trim();
  return {
    output: `.charCodeAt(${indexExpr})`,
    nextPos: bracketEnd + 1,
    skipped: false,
  };
}

/**
 * Transform string indexing to use charCodeAt
 * Skip arrays - they keep normal indexing
 */
export function transformStringIndexing(
  source: string,
  arrayVars?: Set<string>,
): string {
  const arrays = arrayVars ?? new Set<string>();
  let result = "";
  let i = 0;

  while (i < source.length) {
    if (source[i] === '"') {
      const { content, endIdx } = extractStringContent(source, i);
      const { output, nextPos } = processStringIndexing(
        source,
        i,
        content,
        endIdx,
      );
      result += output;
      i = nextPos;
    } else if (source[i] === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== "'") {
        if (source[j] === "\\" && j + 1 < source.length) {
          j += 2;
        } else {
          j++;
        }
      }
      if (j < source.length) j++;
      result += source.slice(i, j);
      i = j;
    } else if (
      source[i] === "[" &&
      i > 0 &&
      (isIdentifierChar(source[i - 1]) || source[i - 1] === ")") &&
      !isStringIndexingContext(source, i)
    ) {
      const { output, nextPos } = processVariableIndexing(source, i, arrays);
      result += output;
      i = nextPos;
    } else {
      result += source[i];
      i++;
    }
  }

  return result;
}
