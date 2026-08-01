// Result monad: represent success or failure without exceptions.
// Returns `{ ok: true, value }` or `{ ok: false, error }` — never throws.

export interface OkResult<T> {
  ok: true;
  value: T;
}

export interface ErrResult<X> {
  ok: false;
  error: X;
}

export type Result<T, X = Error> = OkResult<T> | ErrResult<X>;

export function ok<T>(value: T): OkResult<T> {
  return { ok: true, value };
}

export function err<X>(error: X): ErrResult<X> {
  return { ok: false, error };
}

// Map a successful value through a pure function, preserving errors.
export function map<T, X, U>(
  r: Result<T, X>,
  f: (value: T) => U,
): Result<U, X> {
  return r.ok ? ok(f(r.value)) : r;
}

// Chain a Result-returning function, short-circuiting on error.
export function andThen<T, X, U>(
  r: Result<T, X>,
  f: (value: T) => Result<U, X>,
): Result<U, X> {
  return r.ok ? f(r.value) : r;
}
