import { tokenize } from "./lexer.js";

/**
 * Entry point for the Tuff compiler.
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * A structured error produced by {@link evaluate}.
 */
export type EvalError =
  | { kind: "invalid-literal"; source: string; offset: number; message: string }
  | { kind: "not-implemented"; source: string; offset: number; message: string };

/**
 * The result of evaluating a source expression.
 */
export type EvalResult = { ok: true; value: number } | { ok: false; error: EvalError };

/**
 * Builds a structured "not implemented" error result.
 */
function notImplemented(source: string, offset: number, message: string): EvalResult {
  return { ok: false, error: { kind: "not-implemented", source, offset, message } };
}

/**
 * Builds a structured "invalid literal" error result.
 */
function invalidLiteral(source: string, offset: number, value: string): EvalResult {
  return {
    ok: false,
    error: {
      kind: "invalid-literal",
      source,
      offset,
      message: `"${value}" is not a valid numeric literal. Expected a number like "1" or "3.14".`,
    },
  };
}

/**
 * Evaluates a source expression.
 *
 * Supported: numeric literals (including a leading minus, e.g. "-5") and
 * addition of two numeric literals ("a + b"). Everything else yields a
 * structured error.
 *
 * @param source - The source expression to evaluate.
 * @returns The evaluated value, or a structured error describing the problem.
 */
export function evaluate(source: string): EvalResult {
  const tokens = tokenize(source);
  if (tokens.length === 0) {
    return { ok: true, value: 0 };
  }
  const firstInvalid = tokens.find((t) => t.kind === "invalid");
  if (firstInvalid) {
    return invalidLiteral(source, firstInvalid.offset, firstInvalid.value);
  }
  if (tokens.length === 1) {
    const [token] = tokens;
    if (token.kind === "number") {
      const value = Number(token.value);
      if (Number.isFinite(value)) {
        return { ok: true, value };
      }
      return invalidLiteral(source, token.offset, token.value);
    }
    return notImplemented(
      source,
      token.offset,
      `Only numeric literals and "a + b" expressions are implemented. "${source.trim()}" is not supported yet.`,
    );
  }
  if (tokens.length === 2 && tokens[0].kind === "minus" && tokens[1].kind === "number") {
    const value = Number(tokens[1].value);
    if (Number.isFinite(value)) {
      return { ok: true, value: -value };
    }
    return invalidLiteral(source, tokens[1].offset, tokens[1].value);
  }
  if (tokens.length === 3) {
    const [a, op, b] = tokens;
    if (op.kind === "plus" && a.kind === "number" && b.kind === "number") {
      const left = Number(a.value);
      const right = Number(b.value);
      if (Number.isFinite(left) && Number.isFinite(right)) {
        return { ok: true, value: left + right };
      }
      const bad = Number.isFinite(left) ? b : a;
      return invalidLiteral(source, bad.offset, bad.value);
    }
    if (op.kind === "minus") {
      return notImplemented(
        source,
        op.offset,
        `Subtraction is not implemented yet. Only numeric literals and "a + b" expressions are supported.`,
      );
    }
  }
  const firstOp = tokens.find((t) => t.kind !== "number");
  return notImplemented(
    source,
    firstOp ? firstOp.offset : tokens[0].offset,
    `Only numeric literals and "a + b" expressions are implemented. "${source.trim()}" is not supported yet.`,
  );
}
