export type Result<T> = { type: 'ok'; value: T } | { type: 'err'; error: string };

export function ok<T>(value: T): Result<T> {
  return { type: 'ok', value };
}

export function err<T>(error: string): Result<T> {
  return { type: 'err', error };
}
