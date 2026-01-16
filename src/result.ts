interface Ok<T> {
  type: 'ok';
  value: T;
}

interface Err {
  type: 'err';
  error: string;
}

export type Result<T> = Ok<T> | Err;

export function ok<T>(value: T): Result<T> {
  return { type: 'ok', value };
}

export function err<T>(error: string): Result<T> {
  return { type: 'err', error };
}
