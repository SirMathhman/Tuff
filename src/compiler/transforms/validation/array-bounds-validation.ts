import {
  isDigit,
  isIdentifierChar,
  isIdentifierStartChar,
  isWhitespace,
} from "../../parsing/string-helpers";

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
  let i = 0;
  while (i < source.length) {
    if (source[i] === "l" && source.slice(i, i + 4) === "let ") {
      i = collectArrayInfoFromLet(source, i, boundsInfo);
    } else {
      i++;
    }
  }
}

function collectArrayInfoFromLet(
  source: string,
  startIdx: number,
  boundsInfo: ArrayBoundsInfo,
): number {
  const semiIdx = source.indexOf(";", startIdx);
  const stmtEnd = semiIdx !== -1 ? semiIdx : source.length;

  // Extract variable name
  let j = startIdx + 4; // Skip "let "
  while (j < stmtEnd && isWhitespace(source[j])) j++;
  if (source.slice(j, j + 4) === "mut ") j += 4;
  while (j < stmtEnd && isWhitespace(source[j])) j++;

  let nameEnd = j;
  while (nameEnd < stmtEnd && isIdentifierChar(source[nameEnd])) nameEnd++;
  const varName = source.slice(j, nameEnd);

  // Find the = sign
  const eqIdx = source.indexOf("=", nameEnd);
  if (eqIdx === -1 || eqIdx >= stmtEnd) {
    return semiIdx !== -1 ? semiIdx + 1 : source.length;
  }

  // Check what comes after =
  let valueStart = eqIdx + 1;
  while (valueStart < stmtEnd && isWhitespace(source[valueStart])) valueStart++;

  // Check if it's an array literal
  if (source[valueStart] === "[") {
    const arrayLength = countArrayElements(source, valueStart, stmtEnd);
    if (arrayLength >= 0) {
      boundsInfo.arrayLengths.set(varName, arrayLength);
    }
  }

  // Check if it's a pointer to an array (&arrayName)
  if (source[valueStart] === "&") {
    const targetStart = valueStart + 1;
    let targetEnd = targetStart;
    while (targetEnd < stmtEnd && isIdentifierChar(source[targetEnd]))
      targetEnd++;
    const targetName = source.slice(targetStart, targetEnd);
    if (targetName && boundsInfo.arrayLengths.has(targetName)) {
      boundsInfo.pointerTargets.set(varName, targetName);
    }
  }

  return semiIdx !== -1 ? semiIdx + 1 : source.length;
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
