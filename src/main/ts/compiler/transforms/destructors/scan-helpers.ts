import { isWhitespace } from "../../parsing/string-helpers";

export function findPrevNonWhitespace(source: string, i: number): number {
  let j = i;
  while (j >= 0 && isWhitespace(source[j]!)) j--;
  return j;
}

export function isQuote(ch: string): boolean {
  return ch === '"' || ch === "'";
}

export function skipStringLiteral(source: string, startIdx: number): number {
  const quote = source[startIdx];
  if (!quote || !isQuote(quote)) return startIdx;
  let i = startIdx + 1;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i++;
  }
  return source.length;
}

function trySkipString(source: string, i: number): number | undefined {
  const ch = source[i];
  return ch && isQuote(ch) ? skipStringLiteral(source, i) : undefined;
}

export function scanSkippingStrings(
  source: string,
  startIndex: number,
  onIndex: (i: number) => number | undefined,
): void {
  let i = startIndex;
  while (i < source.length) {
    const skipped = trySkipString(source, i);
    if (skipped !== undefined) {
      i = skipped;
      continue;
    }

    const next = onIndex(i);
    if (next !== undefined) {
      i = next;
      continue;
    }

    i++;
  }
}

type DepthState = {
  parenDepth: number;
  bracketDepth: number;
  braceDepth: number;
};

function updateDepthState(state: DepthState, ch: string): void {
  if (ch === "(") state.parenDepth++;
  else if (ch === ")") state.parenDepth--;
  else if (ch === "[") state.bracketDepth++;
  else if (ch === "]") state.bracketDepth--;
  else if (ch === "{") state.braceDepth++;
  else if (ch === "}") state.braceDepth--;
}

export function scanTopLevel(
  source: string,
  onTopLevelIndex: (i: number) => number | undefined,
): void {
  const state: DepthState = { parenDepth: 0, bracketDepth: 0, braceDepth: 0 };

  scanSkippingStrings(source, 0, (i) => {
    const ch = source[i]!;
    const isTopLevel =
      state.parenDepth === 0 &&
      state.bracketDepth === 0 &&
      state.braceDepth === 0;

    if (isTopLevel) {
      const next = onTopLevelIndex(i);
      if (next !== undefined) return next;
    }

    updateDepthState(state, ch);
    return undefined;
  });
}

export function findMatchingCloseBrace(
  source: string,
  openIdx: number,
): number {
  if (source[openIdx] !== "{") return -1;
  let depth = 1;

  let foundIdx = -1;
  scanSkippingStrings(source, openIdx + 1, (i) => {
    const ch = source[i]!;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        foundIdx = i;
        return source.length;
      }
    }
    return undefined;
  });

  return foundIdx;
}
