import type { Token } from "./lexer.ts";
import type { AstNode } from "./ast.ts";
import type { EvalError } from "./errors.ts";

export type ParseResult =
  | { ok: true; ast: AstNode }
  | { ok: false; error: EvalError };

export function parse(tokens: Token[]): ParseResult {
  const [first, second] = tokens;
  if (first === undefined || first.type === "end") {
    return {
      ok: false,
      error: { kind: "syntax", message: "expected a number", position: 0 },
    };
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
  return { ok: true, ast: { type: "number", value: first.value } };
}
