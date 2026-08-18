import type { TuffError } from "./errors.js";
import type { SourcePosition } from "./position.js";
import type { Result } from "./result.js";

export type Token =
  | { kind: "number"; value: number; pos: SourcePosition }
  | { kind: "plus"; pos: SourcePosition }
  | { kind: "minus"; pos: SourcePosition }
  | { kind: "times"; pos: SourcePosition }
  | { kind: "lparen"; pos: SourcePosition }
  | { kind: "rparen"; pos: SourcePosition };

function fail(
  input: string,
  position: SourcePosition,
  message: string,
): Result<Token[], TuffError> {
  return {
    ok: false,
    error: {
      kind: "unsupported_expression",
      input,
      position,
      message,
    },
  };
}

const OPERATORS: Record<string, "plus" | "minus" | "times" | "lparen" | "rparen"> = {
  "+": "plus",
  "-": "minus",
  "*": "times",
  "(": "lparen",
  ")": "rparen",
};

/**
 * Converts source text into a flat list of tokens.
 *
 * @param input - The expression to lex.
 * @returns A Result holding the token list, or a structured error.
 */
export function lex(input: string): Result<Token[], TuffError> {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let column = 1;

  function advance(count: number): void {
    for (let n = 0; n < count; n += 1) {
      if (input[i] === "\n") {
        line += 1;
        column = 1;
      } else {
        column += 1;
      }
      i += 1;
    }
  }

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      advance(1);
      continue;
    }

    // A `-` is a binary operator only when it follows a token;
    // otherwise it starts a negative numeric literal.
    const op = OPERATORS[ch];
    if (op !== undefined && (ch !== "-" || tokens.length > 0)) {
      tokens.push({ kind: op, pos: { line, column } });
      advance(1);
      continue;
    }

    const match = /^-?\d+(\.\d+)?/.exec(input.slice(i));
    if (match) {
      tokens.push({ kind: "number", value: Number(match[0]), pos: { line, column } });
      advance(match[0].length);
      continue;
    }

    return fail(
      input,
      { line, column },
      `Unexpected character ${JSON.stringify(ch)} at line ${line}, column ${column}`,
    );
  }

  return { ok: true, value: tokens };
}
