import type { EvalError } from "./ast.ts";
import { parse } from "./parser.ts";
import { evalAst } from "./evaluator.ts";
import type { Scope } from "./env.ts";

/**
 * A structured error produced by parsing or evaluation.
 * Re-exported from `ast.ts`, the single source of truth for the error shape.
 */
export type { EvalError };

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
  const rootScope: Scope = { values: {}, mutable: {}, parent: null };
  const outcome = evalAst(parsed.value, { scope: rootScope });
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
  if (typeof outcome.value === "boolean") {
    return { ok: true, value: outcome.value ? 1 : 0 };
  }
  if (typeof outcome.value !== "number") {
    return {
      ok: false,
      error: { kind: "ref-as-result", input: expression, name: "" },
    };
  }
  return { ok: true, value: outcome.value };
}
