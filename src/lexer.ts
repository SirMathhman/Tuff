import type { EvalError } from "./errors.ts";

export type Token =
  | { type: "number"; value: number; position: number }
  | { type: "plus"; position: number }
  | { type: "minus"; position: number }
  | { type: "star"; position: number }
  | { type: "lparen"; position: number }
  | { type: "rparen"; position: number }
  | { type: "lbrace"; position: number }
  | { type: "rbrace"; position: number }
  | { type: "let"; position: number }
  | { type: "ident"; value: string; position: number }
  | { type: "equals"; position: number }
  | { type: "semicolon"; position: number }
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
    if (ch === "-") {
      tokens.push({ type: "minus", position: i });
      i++;
      continue;
    }
    if (ch === "*") {
      tokens.push({ type: "star", position: i });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen", position: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen", position: i });
      i++;
      continue;
    }
    if (ch === "{") {
      tokens.push({ type: "lbrace", position: i });
      i++;
      continue;
    }
    if (ch === "}") {
      tokens.push({ type: "rbrace", position: i });
      i++;
      continue;
    }
    if (ch === "=") {
      tokens.push({ type: "equals", position: i });
      i++;
      continue;
    }
    if (ch === ";") {
      tokens.push({ type: "semicolon", position: i });
      i++;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      const start = i;
      while (i < input.length && /[a-zA-Z0-9_]/.test(input.charAt(i))) i++;
      const text = input.slice(start, i);
      tokens.push(
        text === "let"
          ? { type: "let", position: start }
          : { type: "ident", value: text, position: start },
      );
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
