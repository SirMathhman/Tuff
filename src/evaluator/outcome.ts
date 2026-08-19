import type { EvalError } from "../core/errors.js";

/** A `return` short-circuited evaluation with its value. */
export interface OutcomeValue {
  kind: "value";
  value: number;
}

/** Evaluation completed normally. */
export interface OutcomeVoid {
  kind: "void";
}

/** Evaluation failed with a structured error. */
export interface OutcomeError {
  kind: "error";
  error: EvalError;
}

/** A `break` exited the enclosing `while` loop. */
export interface OutcomeBreak {
  kind: "break";
}

/** A `continue` skipped to the next iteration of the enclosing `while` loop. */
export interface OutcomeContinue {
  kind: "continue";
}

/**
 * The outcome of evaluating a statement or statement list. `value` means a
 * `return` short-circuited; `void` means it completed normally; `break` means
 * a `while` loop was exited; `continue` means the loop skipped to its next
 * iteration; `error` means evaluation failed.
 */
export type Outcome = OutcomeValue | OutcomeVoid | OutcomeBreak | OutcomeContinue | OutcomeError;
