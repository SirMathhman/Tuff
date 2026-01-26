export function findMatchingCloseBrace(
  source: string,
  openBraceIndex: number,
): number {
  if (openBraceIndex < 0 || openBraceIndex >= source.length) return -1;
  if (source[openBraceIndex] !== "{") return -1;

  let braceDepth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") braceDepth++;
    else if (ch === "}") {
      braceDepth--;
      if (braceDepth === 0) return i;
    }
  }
  return -1;
}
