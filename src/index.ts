import type { TuffError } from "./errors.js";
import type { Result } from "./result.js";

/**
 * Evaluates a Tuff expression.
 *
 * @param input - The expression to evaluate.
 * @returns A Result holding the numeric value, or a structured error.
 *          An empty (or whitespace-only) expression evaluates to 0.
 *          Numeric literals evaluate to their value.
 */
export function evaluate(input: string): Result<number, TuffError> {
  const trimmed = input.trim();

  if (trimmed === "") {
    return { ok: true, value: 0 };
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { ok: true, value: Number(trimmed) };
  }

  return {
    ok: false,
    error: {
      kind: "unsupported_expression",
      input,
      message: `Unsupported expression: ${JSON.stringify(input)}`,
    },
  };
}
