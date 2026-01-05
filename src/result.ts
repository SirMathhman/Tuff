export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T, E = string>(value: T): Result<T, E> => ({
  ok: true,
  value,
});
export const err = <T = never, E = string>(error: E): Result<T, E> => ({
  ok: false,
  error,
});
export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } =>
  r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } =>
  !r.ok;
