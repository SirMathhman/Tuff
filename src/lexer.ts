import type { EvalError } from "./errors.ts";

export type Token =
  | { type: "number"; value: number; position: number }
  | { type: "plus"; position: number }
  | { type: "end"; position: number };

export type LexResult =
  | { ok: true; tokens: Token[] }
  | { ok: false; error: EvalError };

export function lex(input: string): LexResult {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input.charAt(i);
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const start = i;
      while (i < input.length && /[0-9]/.test(input.charAt(i))) i++;
      tokens.push({
        type: "number",
        value: Number(input.slice(start, i)),
        position: start,
      });
      continue;
    }
    if (ch === "+") {
      tokens.push({ type: "plus", position: i });
      i++;
      continue;
    }
    return {
      ok: false,
      error: {
        kind: "syntax",
        message: `unexpected character ${ch}`,
        position: i,
      },
    };
  }
  tokens.push({ type: "end", position: i });
  return { ok: true, tokens };
}
