export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<E> {
  ok: false;
  error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export interface InvalidTerm {
  kind: "InvalidTerm";
  term: string;
  index: number;
}

export type TuffError = InvalidTerm;

export function describeError(error: TuffError): string {
  return `Invalid term ${JSON.stringify(error.term)} at index ${error.index}`;
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
  const invalidIndex = terms.findIndex((term) => !isDigits(term.text));
  if (invalidIndex !== -1) {
    return err({
      kind: "InvalidTerm",
      term: terms[invalidIndex]?.text ?? "",
      index: invalidIndex,
    });
  }
  return ok(
    terms.reduce((sum, term) => sum + term.sign * Number(term.text), 0),
  );
}

// TODO: simple repl with interpretTuff
