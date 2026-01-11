import type { Result } from "./result";

export function interpretSpecialLiterals(
  s: string
): Result<number, string> | undefined {
  if (s === "true") return { ok: true, value: 1 };
  if (s === "false") return { ok: true, value: 0 };
  if (s === "break") return { ok: false, error: "break" };
  if (s === "continue") return { ok: false, error: "continue" };
  return undefined;
}

function isIdentStartCode(cc: number): boolean {
  return (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 95;
}

function isIdentCode(cc: number): boolean {
  return isIdentStartCode(cc) || (cc >= 48 && cc <= 57);
}

export function startsWithIdentCall(inp: string): boolean {
  let i = 0;
  while (i < inp.length && inp[i] === " ") i++;
  if (i >= inp.length) return false;

  const first = inp.charCodeAt(i);
  if (!isIdentStartCode(first)) return false;

  let j = i + 1;
  while (j < inp.length) {
    const cc = inp.charCodeAt(j);
    if (!isIdentCode(cc)) break;
    j++;
  }
  while (j < inp.length && inp[j] === " ") j++;
  return j < inp.length && inp[j] === "(";
}
