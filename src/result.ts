export interface Ok<T> {
  ok: true;
  value: T;
}
export interface Err<E> {
  ok: false;
  error: E;
}
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok === true;
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return r.ok === false;
}

export function map<T, U, E>(r: Result<T, E>, fn: (t: T) => U): Result<U, E> {
  return isOk(r) ? ok(fn(r.value)) : (r as Err<E>);
}

export function mapErr<T, E, F>(
  r: Result<T, E>,
  fn: (e: E) => F
): Result<T, F> {
  return isErr(r) ? err(fn(r.error)) : (r as Ok<T>);
}

export function andThen<T, U, E>(
  r: Result<T, E>,
  fn: (t: T) => Result<U, E>
): Result<U, E> {
  return isOk(r) ? fn(r.value) : (r as Err<E>);
}

export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return isOk(r) ? r.value : fallback;
}
