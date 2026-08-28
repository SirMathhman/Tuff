/**
 * A structured evaluation failure.
 */
export interface EvalError {
  /** What kind of failure this is. */
  kind: "invalid-number";
  /** The input that caused the failure. */
  input: string;
}

/**
 * A successful evaluation outcome.
 */
export interface EvalSuccess {
  /** Marks the outcome as successful. */
  ok: true;
  /** The evaluated value. */
  value: number;
}

/**
 * A failed evaluation outcome.
 */
export interface EvalFailure {
  /** Marks the outcome as failed. */
  ok: false;
  /** The structured error. */
  error: EvalError;
}

/**
 * The outcome of evaluating an expression.
 */
export type EvalResult = EvalSuccess | EvalFailure;

/**
 * Evaluate a numeric expression.
 * @param {string} expression - The expression to evaluate.
 * @returns {EvalResult} The evaluated result, or a structured error.
 */
export function evaluate(expression: string): EvalResult {
  if (expression === "") {
    return { ok: true, value: 0 };
  }
  if (/^[0-9]+$/.test(expression)) {
    return { ok: true, value: Number(expression) };
  }
  return { ok: false, error: { kind: "invalid-number", input: expression } };
}
