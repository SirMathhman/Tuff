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
  const plusIndex = trimmed.indexOf("+");
  if (plusIndex !== -1) {
    const left = trimmed.slice(0, plusIndex).trim();
    const right = trimmed.slice(plusIndex + 1).trim();
    const leftValue = Number(left);
    const rightValue = Number(right);
    if (left !== "" && right !== "" && Number.isFinite(leftValue) && Number.isFinite(rightValue)) {
      return { ok: true, value: leftValue + rightValue };
    }
    return {
      ok: false,
      error: {
        kind: "not-implemented",
        source,
        offset: source.indexOf(trimmed) + plusIndex,
        message: `Only addition of two numeric literals is implemented. "${trimmed}" is not supported yet.`,
      },
    };
  }
  const minusIndex = trimmed.indexOf("-");
  if (minusIndex !== -1) {
    return {
      ok: false,
      error: {
        kind: "not-implemented",
        source,
        offset: source.indexOf(trimmed) + minusIndex,
        message: `Subtraction is not implemented yet. Only numeric literals and "a + b" expressions are supported.`,
      },
    };
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
