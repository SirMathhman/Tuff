import {
  isDigit,
  isIdentifierChar,
  isIdentifierStartChar,
  isWhitespace,
} from "../../parsing/string-helpers";
import {
  forEachLetStatement,
  parseLetStatementInfo,
} from "../helpers/let-statement";

export interface ArrayBoundsInfo {
  arrayLengths: Map<string, number>;
  pointerTargets: Map<string, string>;
}

/**
 * Collect array lengths and pointer targets for bounds checking
 */
export function collectArrayInfo(
  source: string,
  boundsInfo: ArrayBoundsInfo,
): void {
  forEachLetStatement(source, (startIdx, info) => {
    collectArrayInfoFromLetInfo(source, startIdx, info, boundsInfo);
  });
}

function collectArrayInfoFromLetInfo(
  source: string,
  _startIdx: number,
  info: ReturnType<typeof parseLetStatementInfo>,
  boundsInfo: ArrayBoundsInfo,
): void {
  if (!info || info.eqIdx === -1) return;

  // Check what comes after =
  let valueStart = info.eqIdx + 1;
  while (valueStart < info.stmtEnd && isWhitespace(source[valueStart])) {
    valueStart++;
  }

  // Check if it's an array literal
  if (source[valueStart] === "[") {
    const arrayLength = countArrayElements(source, valueStart, info.stmtEnd);
    if (arrayLength >= 0) {
      boundsInfo.arrayLengths.set(info.varName, arrayLength);
    }
  }

  // Check if it's a pointer to an array (&arrayName)
  if (source[valueStart] === "&") {
    const targetStart = valueStart + 1;
    let targetEnd = targetStart;
    while (targetEnd < info.stmtEnd && isIdentifierChar(source[targetEnd])) {
      targetEnd++;
    }
    const targetName = source.slice(targetStart, targetEnd);
    if (targetName && boundsInfo.arrayLengths.has(targetName)) {
      boundsInfo.pointerTargets.set(info.varName, targetName);
    }
  }
}

function countArrayElements(
  source: string,
  startIdx: number,
  endIdx: number,
): number {
  if (source[startIdx] !== "[") return -1;

  let j = startIdx + 1;
  let depth = 1;
  let elementCount = 0;
  let hasElement = false;

  while (j < endIdx && depth > 0) {
    const ch = source[j];
    if (ch === "[") {
      depth++;
      hasElement = true;
    } else if (ch === "]") {
      depth--;
      if (depth === 0 && hasElement) elementCount++;
    } else if (ch === "," && depth === 1) {
      if (hasElement) elementCount++;
      hasElement = false;
    } else if (!isWhitespace(ch)) {
      hasElement = true;
    }
    j++;
  }

  return elementCount;
}

/**
 * Validate array index access for constant indices
 */
export function validateArrayIndexAccess(
  source: string,
  boundsInfo: ArrayBoundsInfo,
): void {
  let i = 0;
  while (i < source.length) {
    // Look for identifier followed by [
    if (isIdentifierStartChar(source[i])) {
      const nameStart = i;
      while (i < source.length && isIdentifierChar(source[i])) i++;
      const varName = source.slice(nameStart, i);

      // Skip whitespace
      while (i < source.length && isWhitespace(source[i])) i++;

      if (i < source.length && source[i] === "[") {
        i++; // Skip [

        // Check if this is a pointer to an array
        const targetArray = boundsInfo.pointerTargets.get(varName);
        if (targetArray) {
          const arrayLength = boundsInfo.arrayLengths.get(targetArray);
          if (arrayLength !== undefined) {
            // Try to parse constant index
            const indexResult = tryParseConstantIndex(source, i);
            if (indexResult !== undefined) {
              if (indexResult < 0 || indexResult >= arrayLength) {
                throw new Error(
                  `array index ${indexResult} out of bounds for array of length ${arrayLength}`,
                );
              }
            }
          }
        }

        // Find closing bracket
        let depth = 1;
        while (i < source.length && depth > 0) {
          if (source[i] === "[") depth++;
          else if (source[i] === "]") depth--;
          i++;
        }
      }
    } else {
      i++;
    }
  }
}

function tryParseConstantIndex(
  source: string,
  startIdx: number,
): number | undefined {
  let i = startIdx;
  while (i < source.length && isWhitespace(source[i])) i++;

  // Check for negative sign
  let negative = false;
  if (source[i] === "-") {
    negative = true;
    i++;
    while (i < source.length && isWhitespace(source[i])) i++;
  }

  // Parse digits
  if (!isDigit(source[i])) return undefined;

  let numStr = "";
  while (i < source.length && isDigit(source[i])) {
    numStr += source[i];
    i++;
  }

  // Skip whitespace and check for closing bracket
  while (i < source.length && isWhitespace(source[i])) i++;
  if (source[i] !== "]") return undefined;

  const value = Number(numStr);
  return negative ? -value : value;
}
