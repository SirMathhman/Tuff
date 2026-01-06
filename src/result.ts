export interface Ok<T> {
  ok: true;
  value: T;
}
export interface Err<E> {
  ok: false;
  error: E;
}
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok === true;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => r.ok === false;

export const map = <T, U, E>(r: Result<T, E>, fn: (t: T) => U): Result<U, E> =>
  isOk(r) ? ok(fn(r.value)) : (r as Err<E>);

export const mapErr = <T, E, F>(
  r: Result<T, E>,
  fn: (e: E) => F
): Result<T, F> => (isErr(r) ? err(fn(r.error)) : (r as Ok<T>));

export const andThen = <T, U, E>(
  r: Result<T, E>,
  fn: (t: T) => Result<U, E>
): Result<U, E> => (isOk(r) ? fn(r.value) : (r as Err<E>));

export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T =>
  isOk(r) ? r.value : fallback;
