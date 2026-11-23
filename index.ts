export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export type TuffError = { message: string };

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

const DIGITS = /^\d+$/;

export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const parts = tuffSource.split("+").map((part) => part.trim());
  if (!parts.every((part) => DIGITS.test(part))) {
    return err({ message: `Invalid number in: ${JSON.stringify(tuffSource)}` });
  }
  return ok(
    parts.map((part) => Number(part)).reduce((sum, value) => sum + value),
  );
}

// TODO: simple repl with interpretTuff
