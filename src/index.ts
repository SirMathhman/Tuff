import { parse } from "./parser.ts";
import { evalAst } from "./evaluator.ts";

/**
 * A structured evaluation failure.
 */
export interface EvalError {
  /** What kind of failure this is. */
  kind: "syntax" | "invalid-number" | "unknown-variable" | "immutable-assignment";
  /** The input that caused the failure. */
  input: string;
  /** The position where the failure was found, when known. */
  position?: number;
  /** The name of the unknown variable, when the kind is unknown-variable. */
  name?: string;
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
  const parsed = parse(expression);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const outcome = evalAst(parsed.value, { get: () => undefined });
  if (!outcome.ok) {
    return {
      ok: false,
      error: {
        kind: outcome.kind,
        input: expression,
        name: outcome.name,
      },
    };
  }
  return { ok: true, value: outcome.value };
}
