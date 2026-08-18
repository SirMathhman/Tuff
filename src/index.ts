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
 * Evaluates a source expression.
 *
 * @param source - The source expression to evaluate.
 * @returns The evaluated value, or a structured error describing the problem.
 */
export function evaluate(source: string): EvalResult {
  const trimmed = source.trim();
  if (trimmed === "") {
    return { ok: true, value: 0 };
  }
  const value = Number(trimmed);
  if (Number.isFinite(value)) {
    return { ok: true, value };
  }
  return {
    ok: false,
    error: {
      kind: "invalid-literal",
      source,
      offset: source.indexOf(trimmed),
      message: `"${trimmed}" is not a valid numeric literal. Expected a number like "1" or "3.14".`,
    },
  };
}
