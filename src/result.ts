export interface OkResult<T> {
  ok: true;
  value: T;
}

export interface ErrResult<E> {
  ok: false;
  error: E;
}

export type Result<T, E> = OkResult<T> | ErrResult<E>;

export function ok<T>(value: T): OkResult<T> {
  return { ok: true, value };
}

export function err<E>(error: E): ErrResult<E> {
  return { ok: false, error };
}
