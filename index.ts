export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<E> {
  ok: false;
  error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export interface TuffError {
  message: string;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

function isDigits(text: string): boolean {
  return (
    text.length > 0 && [...text].every((char) => char >= "0" && char <= "9")
  );
}

interface Term {
  sign: number;
  text: string;
}

function parseTerm(chunk: string): Term {
  const trimmed = chunk.trim();
  return trimmed.startsWith("-")
    ? { sign: -1, text: trimmed.slice(1).trim() }
    : { sign: 1, text: trimmed };
}

export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const terms = tuffSource.replaceAll("-", "+-").split("+").map(parseTerm);
  if (!terms.every((term) => isDigits(term.text))) {
    return err({ message: `Invalid number in: ${JSON.stringify(tuffSource)}` });
  }
  return ok(
    terms.reduce((sum, term) => sum + term.sign * Number(term.text), 0),
  );
}

// TODO: simple repl with interpretTuff
