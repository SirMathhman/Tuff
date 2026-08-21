import type { Result } from "./result.ts";

export function tokenize(input: string): Result<string[], { reason: string }> {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input.charAt(i);
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input.charAt(j))) j++;
      tokens.push(input.slice(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input.charAt(j))) j++;
      tokens.push(input.slice(i, j));
      i = j;
      continue;
    }
    if (c === "=" && input.charAt(i + 1) === "=") {
      tokens.push("==");
      i += 2;
      continue;
    }
    if (c === "|" && input.charAt(i + 1) === "|") {
      tokens.push("||");
      i += 2;
      continue;
    }
    if (c === "&" && input.charAt(i + 1) === "&") {
      tokens.push("&&");
      i += 2;
      continue;
    }
    if (c === ">" && input.charAt(i + 1) === "=") {
      tokens.push(">=");
      i += 2;
      continue;
    }
    if ("+-*/(){};!=>".includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }
    return { ok: false, error: { reason: `unexpected character: ${c}` } };
  }
  return { ok: true, value: tokens };
}
