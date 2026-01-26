/**
 * Wrap pointer target variables in arrays to simulate pointer semantics.
 *
 * When a variable is the target of a pointer operation (&x), we wrap its
 * initialization in an array so that pointer assignments can modify it.
 *
 * Example:
 *   Input:  let mut x = 100; let y : *mut I32 = &x; *y = 50; x
 *   Output: let x = [100]; let y = x; y[0] = 50; x[0]
 */

import { isWhitespace, isIdentifierChar } from "../../parsing/string-helpers";

function parseLetStatement(
  source: string,
  startIdx: number,
):
  | {
      varName: string;
      stmtStart: number;
      stmtEnd: number;
      colonIdx: number;
      eqIdx: number;
    }
  | undefined {
  const semiIdx = source.indexOf(";", startIdx);
  const stmtEnd = semiIdx !== -1 ? semiIdx : source.length;
  let j = startIdx + 4;

  while (j < stmtEnd && isWhitespace(source[j]!)) j++;

  if (source.slice(j, j + 3) === "mut") {
    j += 3;
    while (j < stmtEnd && isWhitespace(source[j]!)) j++;
  }

  let varEnd = j;
  while (varEnd < stmtEnd && isIdentifierChar(source[varEnd]!)) {
    varEnd++;
  }

  const varName = source.slice(j, varEnd).trim();
  let colonIdx = j;

  while (
    colonIdx < stmtEnd &&
    source[colonIdx] !== ":" &&
    source[colonIdx] !== "="
  ) {
    colonIdx++;
  }

  const eqIdx = source.indexOf("=", varEnd);

  return {
    varName,
    stmtStart: startIdx,
    stmtEnd,
    colonIdx,
    eqIdx: eqIdx !== -1 ? eqIdx : -1,
  };
}

function wrapInitializationValue(
  source: string,
  eqIdx: number,
  stmtStart: number,
  stmtEnd: number,
): string {
  let result = source.slice(stmtStart, eqIdx + 1);
  result += " [";

  let valStart = eqIdx + 1;
  while (valStart < stmtEnd && isWhitespace(source[valStart]!)) {
    valStart++;
  }

  result += source.slice(valStart, stmtEnd);
  result += "]";
  return result;
}

export function wrapPointerTargets(
  source: string,
  targets: Set<string>,
  arrayVars?: Set<string>,
): string {
  const arrays = arrayVars || new Set<string>();
  let result = "";
  let i = 0;

  while (i < source.length) {
    if (source[i] === "l" && source.slice(i, i + 4) === "let ") {
      const parsed = parseLetStatement(source, i);

      if (
        parsed &&
        targets.has(parsed.varName) &&
        !arrays.has(parsed.varName)
      ) {
        const hasTypeAnnotation =
          parsed.colonIdx < parsed.stmtEnd && source[parsed.colonIdx] === ":";

        if (!hasTypeAnnotation && parsed.eqIdx !== -1) {
          result += wrapInitializationValue(
            source,
            parsed.eqIdx,
            parsed.stmtStart,
            parsed.stmtEnd,
          );
          i = parsed.stmtEnd;
          continue;
        }
      }

      if (parsed) {
        result += source.slice(parsed.stmtStart, parsed.stmtEnd);
        i = parsed.stmtEnd;
      } else {
        result += source[i];
        i++;
      }
    } else {
      result += source[i];
      i++;
    }
  }

  return result;
}
