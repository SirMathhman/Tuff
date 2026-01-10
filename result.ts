interface OkResult<T> {
  ok: true;
  value: T;
}

interface ErrResult<E> {
  ok: false;
  error: E;
}

export type Result<T, E> = OkResult<T> | ErrResult<E>;

export function Ok<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function Err<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}
