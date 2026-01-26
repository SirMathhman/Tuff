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

import { isWhitespace } from "../../parsing/string-helpers";
import {
  forEachLetStatement,
  type LetStatementInfo,
} from "../helpers/let-statement";

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
  let lastIdx = 0;

  const handleLet = (startIdx: number, info: LetStatementInfo): void => {
    result += source.slice(lastIdx, startIdx);

    if (
      targets.has(info.varName) &&
      !arrays.has(info.varName) &&
      info.eqIdx !== -1
    ) {
      result += wrapInitializationValue(
        source,
        info.eqIdx,
        startIdx,
        info.stmtEnd,
      );
    } else {
      result += source.slice(startIdx, info.stmtEnd);
    }

    lastIdx = info.stmtEnd;
  };

  forEachLetStatement(source, handleLet);

  result += source.slice(lastIdx);
  return result;
}
