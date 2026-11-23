export interface Ok<T> {
  ok: true;
  value: T;
}
export interface Err<E> {
  ok: false;
  error: E;
}
export type Result<T, E> = Ok<T> | Err<E>;
export interface ErrorWhere {
  index: number;
  text: string;
}
export interface TuffErrorDetails {
  why: string;
  where: ErrorWhere;
  fix: string;
}
export interface InvalidTerm extends TuffErrorDetails {
  kind: "InvalidTerm";
}
export interface TermTooLarge extends TuffErrorDetails {
  kind: "TermTooLarge";
}
export interface ResultTooLarge extends TuffErrorDetails {
  kind: "ResultTooLarge";
}
export interface NestingTooDeep extends TuffErrorDetails {
  kind: "NestingTooDeep";
}
export type TuffError =
  | InvalidTerm
  | TermTooLarge
  | ResultTooLarge
  | NestingTooDeep;


export function describeWhere(where: ErrorWhere): string {
  return where.text === ""
    ? "the end of the input"
    : `${JSON.stringify(where.text)} at index ${where.index}`;
}


export function describeError(error: TuffError): string {
  return `${error.kind}: ${error.why}\n  Where: ${describeWhere(error.where)}\n  Fix: ${error.fix}`;
}


export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}


export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}


export function resultTooLargeAt(where: ErrorWhere): Err<TuffError> {
  return err({
    kind: "ResultTooLarge",
    why: `The running value leaves the safe integer range (±${Number.MAX_SAFE_INTEGER}), so its digits can no longer be stored exactly.`,
    where,
    fix: `Keep every intermediate and final result within ±${Number.MAX_SAFE_INTEGER}, for example by splitting the calculation.`,
  });
}
