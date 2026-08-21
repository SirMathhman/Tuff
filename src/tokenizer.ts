import type { Result } from "./result.ts";

export type Token = { text: string; start: number; end: number };

export function tokenize(
  input: string,
): Result<Token[], { reason: string; offset: number }> {
  const tokens: Token[] = [];
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
      tokens.push({ text: input.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input.charAt(j))) j++;
      tokens.push({ text: input.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    if (c === "=" && input.charAt(i + 1) === "=") {
      tokens.push({ text: "==", start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (c === "|" && input.charAt(i + 1) === "|") {
      tokens.push({ text: "||", start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (c === "&" && input.charAt(i + 1) === "&") {
      tokens.push({ text: "&&", start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (c === ">" && input.charAt(i + 1) === "=") {
      tokens.push({ text: ">=", start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (c === "<" && input.charAt(i + 1) === "=") {
      tokens.push({ text: "<=", start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (c === "!" && input.charAt(i + 1) === "=") {
      tokens.push({ text: "!=", start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if ("+-*/(){};!=<>".includes(c)) {
      tokens.push({ text: c, start: i, end: i + 1 });
      i++;
      continue;
    }
    return {
      ok: false,
      error: { reason: `unexpected character: ${c}`, offset: i },
    };
  }
  return { ok: true, value: tokens };
}
