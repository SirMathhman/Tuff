import type { Token } from "./types.ts";

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (ch === "+" || ch === "-" || ch === "*") {
      tokens.push({ value: ch, index: i });
      i++;
    } else if (/\d/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[\d.]/.test(input.charAt(j))) j++;
      tokens.push({ value: input.slice(i, j), index: i });
      i = j;
    } else if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_]/.test(input.charAt(j))) j++;
      tokens.push({ value: input.slice(i, j), index: i });
      i = j;
    } else if (/\s/.test(ch)) {
      i++;
    } else {
      tokens.push({ value: ch, index: i });
      i++;
    }
  }
  return tokens;
}
