/** A successful result carrying a value. */
export interface Ok<T> {
  /** Always `true` for a success. */
  ok: true;
  /** The computed value. */
  value: T;
}

/** A failed result carrying an error. */
export interface Err<E> {
  /** Always `false` for a failure. */
  ok: false;
  /** The error describing the failure. */
  error: E;
}

/** Either a success with a value or a failure with an error. */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Wraps a value as a successful result.
 *
 * @param value - The value to wrap.
 * @returns An `Ok` holding `value`.
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Wraps an error as a failed result.
 *
 * @param error - The error to wrap.
 * @returns An `Err` holding `error`.
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
