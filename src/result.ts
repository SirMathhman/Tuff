/**
 * A Result type representing either a success value or a failure error.
 *
 * @typeParam T - The success value type.
 * @typeParam E - The error type.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
