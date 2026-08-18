/**
 * Structured error types and the Result type shared across compiler layers.
 *
 * Errors never cross module boundaries as thrown exceptions; fallible
 * operations return `Result<T, E>` instead.
 */

/** Source position of a token or error. Line and column are 1-based. */
export interface SourcePosition {
  /** Zero-based offset from the start of the input. */
  offset: number;
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column: number;
}

/**
 * A structured compiler error. Each variant answers the four questions:
 * what (kind + message), where (position), why (message), how to fix (hint).
 */
export type TuffError =
  | { kind: "lex"; message: string; position: SourcePosition; hint: string }
  | { kind: "parse"; message: string; position: SourcePosition; hint: string }
  | { kind: "eval"; message: string; position: SourcePosition; hint: string };

/** The outcome of a fallible operation: either a value or a structured error. */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
