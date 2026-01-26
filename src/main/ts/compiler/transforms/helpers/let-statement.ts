import { isIdentifierChar, isWhitespace } from "../../parsing/string-helpers";

export interface LetStatementInfo {
  stmtEnd: number;
  varName: string;
  nameStart: number;
  nameEnd: number;
  eqIdx: number;
  colonIdx: number;
}

export function forEachLetStatement(
  source: string,
  visitor: (startIdx: number, info: LetStatementInfo) => void,
): void {
  let i = 0;
  while (i < source.length) {
    if (source[i] === "l" && source.slice(i, i + 4) === "let ") {
      const info = parseLetStatementInfo(source, i);
      if (info) {
        visitor(i, info);
        i = info.stmtEnd;
        continue;
      }
    }
    i++;
  }
}

export function parseLetStatementInfo(
  source: string,
  startIdx: number,
): LetStatementInfo | undefined {
  if (source.slice(startIdx, startIdx + 4) !== "let ") return undefined;

  const semiIdx = source.indexOf(";", startIdx);
  const stmtEnd = semiIdx !== -1 ? semiIdx : source.length;

  let j = startIdx + 4;
  while (j < stmtEnd && isWhitespace(source[j]!)) j++;

  if (source.slice(j, j + 3) === "mut") {
    j += 3;
    while (j < stmtEnd && isWhitespace(source[j]!)) j++;
  }

  const nameStart = j;
  let nameEnd = nameStart;
  while (nameEnd < stmtEnd && isIdentifierChar(source[nameEnd]!)) nameEnd++;

  const varName = source.slice(nameStart, nameEnd);

  const eqIdx = source.indexOf("=", nameEnd);

  let colonIdx = nameEnd;
  while (
    colonIdx < stmtEnd &&
    source[colonIdx] !== ":" &&
    source[colonIdx] !== "="
  ) {
    colonIdx++;
  }

  return {
    stmtEnd,
    varName,
    nameStart,
    nameEnd,
    eqIdx: eqIdx !== -1 && eqIdx < stmtEnd ? eqIdx : -1,
    colonIdx,
  };
}
