/**
 * The project's error-handling primitive. Every fallible function returns a
 * `Result<T, E>` — a success carrying a value or a failure carrying a
 * structured error. No function throws.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<E> {
  ok: false;
  error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
