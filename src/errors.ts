/** A successful result carrying a value. */
export type Ok<T> = { ok: true; value: T };

/** A failed result carrying a structured error. */
export type Err<E> = { ok: false; error: E };

/** A discriminated union of success and failure. */
export type Result<T, E> = Ok<T> | Err<E>;

/** Create a successful result. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Create a failed result. */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/**
 * Structured errors produced by `evaluate`.
 * Each variant answers: what went wrong, where, and how to fix it.
 */
export type EvalError =
  | {
      /** The input contained no statements. Fix: provide at least one statement. */
      kind: "EmptyProgram";
    }
  | {
      /** A statement the evaluator does not recognize. Fix: use `let` or `return` statements. */
      kind: "UnexpectedStatement";
      /** The offending statement text. */
      statement: string;
      /** Zero-based index of the statement. */
      index: number;
    }
  | {
      /** A `return` referenced a variable that was never declared. Fix: declare it with `let` first. */
      kind: "UnknownIdentifier";
      /** The undeclared variable name. */
      name: string;
      /** Zero-based index of the statement. */
      index: number;
    }
  | {
      /** The program ended without a `return` statement. Fix: add a `return` statement. */
      kind: "MissingReturn";
    };
