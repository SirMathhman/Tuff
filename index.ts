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

function splitTerms(source: string): Term[] {
  const terms: Term[] = [];
  let sign = 1;
  let text = "";
  for (const char of source) {
    if (char === "+" || char === "-") {
      terms.push({ sign, text: text.trim() });
      sign = char === "+" ? 1 : -1;
      text = "";
    } else {
      text += char;
    }
  }
  terms.push({ sign, text: text.trim() });
  return terms;
}

export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const terms = splitTerms(tuffSource);
  if (!terms.every((term) => isDigits(term.text))) {
    return err({ message: `Invalid number in: ${JSON.stringify(tuffSource)}` });
  }
  return ok(
    terms.reduce((sum, term) => sum + term.sign * Number(term.text), 0),
  );
}

// TODO: simple repl with interpretTuff
