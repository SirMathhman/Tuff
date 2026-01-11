export function isStandaloneElseAt(s: string, idx: number): boolean {
  const n = s.length;
  const before = idx - 1 < 0 ? "" : s[idx - 1];
  const after = idx + 4 >= n ? "" : s[idx + 4];
  const validBefore =
    before === "" || before === " " || before === ")" || before === "{";
  const validAfter =
    after === "" ||
    after === " " ||
    after === ";" ||
    after === ")" ||
    after === "{";
  return validBefore && validAfter;
}

export function findTopLevelElseInString(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (depth === 0 && s.startsWith("else", i) && isStandaloneElseAt(s, i))
      return i;
  }
  return -1;
}
