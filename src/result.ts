/**
 * A successful result carrying a value.
 */
export interface Ok<T> {
  /**
   * Discriminant marking success.
   */
  readonly ok: true;
  /**
   * The value produced by the successful computation.
   */
  readonly value: T;
}

/**
 * A failed result carrying an error.
 */
export interface Err<E> {
  /**
   * Discriminant marking failure.
   */
  readonly ok: false;
  /**
   * The error describing why the computation failed.
   */
  readonly error: E;
}

/**
 * A computation outcome that is either a success (Ok) or a failure (Err).
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Wraps a value as a successful result.
 *
 * @param value - The value to wrap.
 * @returns An Ok result holding the value.
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Wraps an error as a failed result.
 *
 * @param error - The error to wrap.
 * @returns An Err result holding the error.
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
