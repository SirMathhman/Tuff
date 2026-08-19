/** A successful result carrying a value. */
export interface Ok<T> { ok: true; value: T }

/** A failed result carrying a structured error. */
export interface Err<E> { ok: false; error: E }

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
 * A static type name: a primitive, or a pointer type (possibly nested, e.g.
 * `ptr<ptr<number>>`) represented as a string. Pointer types are built
 * dynamically, so they are carried as plain strings rather than a recursive
 * template-literal alias (which TypeScript rejects).
 */
export type TypeName = "number" | "bool" | (string & {});

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
      /** The lexer encountered a character it cannot tokenize. Fix: remove or replace the character. */
      kind: "UnexpectedToken";
      /** The offending character. */
      character: string;
      /** Zero-based character offset in the source. */
      position: number;
    }
  | {
      /** A statement the evaluator does not recognize. Fix: use `let` or `return` statements. */
      kind: "UnexpectedStatement";
      /** The offending statement text. */
      statement: string;
      /** Zero-based character offset of the statement's first token. */
      position: number;
    }
  | {
      /** A `return` referenced a variable that was never declared. Fix: declare it with `let` first. */
      kind: "UnknownIdentifier";
      /** The undeclared variable name. */
      name: string;
      /** Zero-based character offset of the statement that used the variable. */
      position: number;
    }
  | {
      /** An assignment to a variable declared without `mut`. Fix: declare it with `let mut`. */
      kind: "ImmutableAssignment";
      /** The immutable variable name. */
      name: string;
      /** Zero-based character offset of the assignment statement. */
      position: number;
    }
  | {
      /** A value of the wrong type was assigned to a variable. Fix: assign a value of the variable's type. */
      kind: "TypeMismatch";
      /** The variable name. */
      name: string;
      /** The variable's type, set by its initializer. */
      expected: TypeName;
      /** The type of the value being assigned. */
      actual: TypeName;
      /** Zero-based character offset of the assignment statement. */
      position: number;
    }
  | {
      /** The program ended without a `return` statement. Fix: add a `return` statement. */
      kind: "MissingReturn";
    };
