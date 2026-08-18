import type { TuffError } from "./errors.js";
import type { Result } from "./result.js";

export type Token =
  | { kind: "number"; value: number }
  | { kind: "plus" }
  | { kind: "minus" }
  | { kind: "times" }
  | { kind: "lparen" }
  | { kind: "rparen" };

function fail(input: string, message: string): Result<Token[], TuffError> {
  return {
    ok: false,
    error: {
      kind: "unsupported_expression",
      input,
      message,
    },
  };
}

/**
 * Converts source text into a flat list of tokens.
 *
 * @param input - The expression to lex.
 * @returns A Result holding the token list, or a structured error.
 */
export function lex(input: string): Result<Token[], TuffError> {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === "+") {
      tokens.push({ kind: "plus" });
      i += 1;
      continue;
    }

    // A `-` is a binary operator only when it follows a token;
    // otherwise it starts a negative numeric literal.
    if (ch === "-" && tokens.length > 0) {
      tokens.push({ kind: "minus" });
      i += 1;
      continue;
    }

    if (ch === "*") {
      tokens.push({ kind: "times" });
      i += 1;
      continue;
    }

    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }

    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }

    const match = /^-?\d+(\.\d+)?/.exec(input.slice(i));
    if (match) {
      tokens.push({ kind: "number", value: Number(match[0]) });
      i += match[0].length;
      continue;
    }

    return fail(input, `Unexpected character ${JSON.stringify(ch)} at position ${i}`);
  }

  return { ok: true, value: tokens };
}
