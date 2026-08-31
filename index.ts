import { lex } from "./src/lexer.ts";
import type { EvalError } from "./src/errors.ts";

export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: EvalError };

export function evaluate(input: string): EvalResult {
  const lexed = lex(input);
  if (!lexed.ok) {
    return lexed;
  }
  const [first, second] = lexed.tokens;
  if (first === undefined || first.type === "end") {
    // Policy: empty input evaluates to 0.
    return { ok: true, value: 0 };
  }
  if (second === undefined || second.type !== "end") {
    return {
      ok: false,
      error: {
        kind: "syntax",
        message: "expected end of input",
        position: second?.position ?? first.position,
      },
    };
  }
  return { ok: true, value: first.value };
}
