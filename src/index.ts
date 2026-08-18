/**
 * A structured error describing why evaluation failed.
 */
export type EvaluateError = {
  kind: "invalid-number";
  input: string;
  reason: string;
};

/**
 * The result of evaluating a Tuff expression.
 */
export type EvaluateResult = { ok: true; value: number } | { ok: false; error: EvaluateError };

/**
 * Evaluates a Tuff expression.
 *
 * Empty input is a defined case and evaluates to 0.
 */
export function evaluate(input: string): EvaluateResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: true, value: 0 };
  }
  const value = Number(trimmed);
  if (Number.isNaN(value)) {
    return {
      ok: false,
      error: {
        kind: "invalid-number",
        input,
        reason: `Cannot parse "${input}" as a number`,
      },
    };
  }
  return { ok: true, value };
}
