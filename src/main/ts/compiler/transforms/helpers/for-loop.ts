import {
  isWhitespace,
  isIdentifierChar,
  isDigit,
  matchWord,
  skipWhitespace,
} from "../../parsing/string-helpers";
import {
  parseCondition,
  parseBody,
  parseUntilSemicolon,
} from "../../parsing/parse-helpers";

/**
 * Check if a string is a valid identifier (array variable name)
 */
function isValidIdentifier(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length === 0) return false;
  if (!isIdentifierChar(trimmed[0]!) || isDigit(trimmed[0]!)) return false;
  for (let i = 1; i < trimmed.length; i++) {
    if (!isIdentifierChar(trimmed[i]!)) return false;
  }
  return true;
}

/**
 * Parse for-in loop range (start..end) values
 */
function extractRangeValues(afterIn: string): { start: string; end: string } {
  let start = "0";
  let end = "10";

  const dotDotIdx = afterIn.indexOf("..");
  if (dotDotIdx > 0) {
    let startNum = "";
    let j = 0;
    while (j < dotDotIdx && (isDigit(afterIn[j]) || isWhitespace(afterIn[j]))) {
      if (isDigit(afterIn[j])) startNum += afterIn[j];
      j++;
    }
    if (startNum) start = startNum;

    let endNum = "";
    j = dotDotIdx + 2;
    while (
      j < afterIn.length &&
      (isDigit(afterIn[j]) || isWhitespace(afterIn[j]))
    ) {
      if (isDigit(afterIn[j])) endNum += afterIn[j];
      j++;
    }
    if (endNum) end = endNum;
  }

  return { start, end };
}

/**
 * Parse for-in loop init to extract var name and range or array
 */
function parseForInit(initContent: string): {
  varName: string;
  start?: string;
  end?: string;
  arrayVar?: string;
} {
  let varName = "";
  let start: string | undefined;
  let end: string | undefined;
  let arrayVar: string | undefined;

  let inIdx = initContent.indexOf(" in ");
  let hasSpace = true;
  if (inIdx === -1) {
    inIdx = initContent.indexOf("in");
    hasSpace = false;
  }

  if (inIdx >= 0) {
    const beforeIn = initContent.slice(0, inIdx).trim();
    const afterIn = hasSpace
      ? initContent.slice(inIdx + 4).trim()
      : initContent.slice(inIdx + 2).trim();

    let nameEnd = beforeIn.length;
    while (nameEnd > 0 && isWhitespace(beforeIn[nameEnd - 1])) nameEnd--;
    let nameStart = nameEnd;
    while (nameStart > 0 && isIdentifierChar(beforeIn[nameStart - 1]))
      nameStart--;
    if (nameStart < nameEnd) {
      varName = beforeIn.slice(nameStart, nameEnd);
    }

    // Check if afterIn is a simple identifier (array variable)
    if (isValidIdentifier(afterIn) && !afterIn.includes("..")) {
      arrayVar = afterIn;
    } else {
      // Parse as range
      const range = extractRangeValues(afterIn);
      start = range.start;
      end = range.end;
    }
  }

  return { varName, start, end, arrayVar };
}

/**
 * Transform for (let x in start..end) expr or for (let x in array) expr
 */
export function transformFor(
  source: string,
  startIdx: number,
): { result: string; endIdx: number } | undefined {
  let i = skipWhitespace(source, startIdx + 3);
  if (i >= source.length || source[i] !== "(") return undefined;

  const { condition: initContent, endIdx: initEndIdx } = parseCondition(
    source,
    i,
  );
  i = initEndIdx;

  const parsed = parseForInit(initContent);
  const varName = parsed.varName;
  i = skipWhitespace(source, i);
  const { body, endIdx: bodyEndIdx } = parseBody(source, i);
  i = bodyEndIdx;

  let result: string;
  if (parsed.arrayVar) {
    // Array iteration: for each element in array
    result = `(function() { for(let __i_=0; __i_<${parsed.arrayVar}.length; __i_++) { let ${varName} = ${parsed.arrayVar}[__i_]; ${body}; } return 0; })()`;
  } else {
    // Range iteration: from start to end
    const start = parsed.start || "0";
    const end = parsed.end || "10";
    result = `(function() { for(let __i_=${start}; __i_<${end}; __i_++) { let ${varName} = __i_; ${body}; } return 0; })()`;
  }

  return { result, endIdx: i };
}

/**
 * Transform break statements inside loops to throw exceptions
 */
export function transformBreakInLoop(source: string): string {
  let result = "";
  let i = 0;

  while (i < source.length) {
    if (matchWord(source, i, "break")) {
      i = skipWhitespace(source, i + 5);

      let breakValue = "0";
      if (i < source.length && source[i] !== ";" && source[i] !== "}") {
        const { content, endIdx: breakEndIdx } = parseUntilSemicolon(source, i);
        breakValue = content;
        i = breakEndIdx;
      }

      result += `(__break_value = ${breakValue}, (function() { throw "__break__"; })())`;
      continue;
    }

    result += source[i];
    i++;
  }

  return result;
}
