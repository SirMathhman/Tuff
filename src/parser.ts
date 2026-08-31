import type { Token } from "./lexer.ts";
import type { AstNode } from "./ast.ts";
import type { EvalError } from "./errors.ts";

export type ParseResult =
  | { ok: true; ast: AstNode }
  | { ok: false; error: EvalError };

export function parse(tokens: Token[]): ParseResult {
  // Grammar rule: empty input (only the end token) evaluates to 0.
  if (tokens.length === 1 && tokens[0]!.type === "end") {
    return { ok: true, ast: { type: "number", value: 0 } };
  }
  let i = 0;
  const next = (): Token | undefined => tokens[i];
  const advance = (): Token | undefined => tokens[i++];

  const parseNumber = (): ParseResult => {
    const tok = advance();
    if (tok === undefined || tok.type !== "number") {
      return {
        ok: false,
        error: {
          kind: "syntax",
          message: "expected a number",
          position: tok?.position ?? 0,
        },
      };
    }
    return { ok: true, ast: { type: "number", value: tok.value } };
  };

  // expr := number (('+' | '-') number)*, left-associative
  const left = parseNumber();
  if (!left.ok) {
    return left;
  }
  let ast = left.ast;
  for (;;) {
    const op = next();
    if (op === undefined || (op.type !== "plus" && op.type !== "minus")) {
      break;
    }
    advance();
    const right = parseNumber();
    if (!right.ok) {
      return right;
    }
    ast =
      op.type === "plus"
        ? { type: "add", left: ast, right: right.ast }
        : { type: "sub", left: ast, right: right.ast };
  }

  const trailing = next();
  if (trailing === undefined || trailing.type !== "end") {
    return {
      ok: false,
      error: {
        kind: "syntax",
        message: "expected end of input",
        position: trailing?.position ?? 0,
      },
    };
  }
  return { ok: true, ast };
}
