export function findSemicolonAtDepthZero(
  input: string,
  startIdx: number
): number {
  let depth = 0;
  for (let i = startIdx; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth === 0 && ch === ";") return i;
  }
  return -1;
}

export function findMatchingBrace(input: string, startIdx: number): number {
  let depth = 0;
  for (let i = startIdx; i < input.length; i++) {
    const ch = input[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) return i;
  }
  return -1;
}
