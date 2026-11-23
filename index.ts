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

export type TuffError = InvalidTerm | TermTooLarge | ResultTooLarge;

function describeWhere(where: ErrorWhere): string {
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

function isDigits(text: string): boolean {
  return (
    text.length > 0 && [...text].every((char) => char >= "0" && char <= "9")
  );
}

function whereAt(tokens: string[], index: number): ErrorWhere {
  return { index, text: tokens[index] ?? "" };
}

function invalidAt(
  tokens: string[],
  index: number,
  expected: string,
  fix: string,
): Err<TuffError> {
  const where = whereAt(tokens, index);
  const found =
    where.text === "" ? "the end of the input" : JSON.stringify(where.text);
  return err({
    kind: "InvalidTerm",
    why: `Expected ${expected} but found ${found}.`,
    where,
    fix,
  });
}

function termTooLargeAt(tokens: string[], index: number): Err<TuffError> {
  const where = whereAt(tokens, index);
  return err({
    kind: "TermTooLarge",
    why: `${JSON.stringify(where.text)} is larger than ${Number.MAX_SAFE_INTEGER}, so it cannot be stored exactly.`,
    where,
    fix: `Use an integer of at most ${Number.MAX_SAFE_INTEGER}.`,
  });
}

function resultTooLargeAt(tokens: string[], index: number): Err<TuffError> {
  return err({
    kind: "ResultTooLarge",
    why: `The running value leaves the safe integer range (±${Number.MAX_SAFE_INTEGER}), so its digits can no longer be stored exactly.`,
    where: whereAt(tokens, index),
    fix: `Keep every intermediate and final result within ±${Number.MAX_SAFE_INTEGER}, for example by splitting the calculation.`,
  });
}

interface Parsed {
  value: number;
  next: number;
}

type Parse = Result<Parsed, TuffError>;

// Grammar:
//   expr    := term (("+" | "-") term)*
//   term    := factor ("*" factor)*
//   factor  := "-"? primary
//   primary := number | "(" expr ")"
// Each rule returns the value and the index of the next unread token.

function parsePrimary(tokens: string[], pos: number): Parse {
  const token = tokens[pos];
  if (token === "(") {
    const inner = parseExpr(tokens, pos + 1);
    if (!inner.ok) {
      return inner;
    }
    if (tokens[inner.value.next] !== ")") {
      return invalidAt(
        tokens,
        inner.value.next,
        "')'",
        "Close the parenthesis with ')'.",
      );
    }
    return ok({ value: inner.value.value, next: inner.value.next + 1 });
  }
  if (token !== undefined && isDigits(token)) {
    if (Number(token) > Number.MAX_SAFE_INTEGER) {
      return termTooLargeAt(tokens, pos);
    }
    return ok({ value: Number(token), next: pos + 1 });
  }
  return invalidAt(
    tokens,
    pos,
    "a number, '-', or '('",
    "Put a number, a '-' before a number, or a parenthesized expression here.",
  );
}

function parseFactor(tokens: string[], pos: number): Parse {
  if (tokens[pos] === "-") {
    const operand = parsePrimary(tokens, pos + 1);
    return operand.ok
      ? ok({ value: -operand.value.value, next: operand.value.next })
      : operand;
  }
  return parsePrimary(tokens, pos);
}

function parseTermTail(tokens: string[], left: number, pos: number): Parse {
  if (tokens[pos] !== "*") {
    return ok({ value: left, next: pos });
  }
  const right = parseFactor(tokens, pos + 1);
  if (!right.ok) {
    return right;
  }
  const product = left * right.value.value;
  if (!Number.isSafeInteger(product)) {
    return resultTooLargeAt(tokens, pos);
  }
  return parseTermTail(tokens, product, right.value.next);
}

function parseTerm(tokens: string[], pos: number): Parse {
  const first = parseFactor(tokens, pos);
  if (!first.ok) {
    return first;
  }
  return parseTermTail(tokens, first.value.value, first.value.next);
}

function parseExprTail(tokens: string[], left: number, pos: number): Parse {
  const op = tokens[pos];
  if (op !== "+" && op !== "-") {
    return ok({ value: left, next: pos });
  }
  const right = parseTerm(tokens, pos + 1);
  if (!right.ok) {
    return right;
  }
  const sum =
    op === "+" ? left + right.value.value : left - right.value.value;
  if (!Number.isSafeInteger(sum)) {
    return resultTooLargeAt(tokens, pos);
  }
  return parseExprTail(tokens, sum, right.value.next);
}

function parseExpr(tokens: string[], pos: number): Parse {
  const first = parseTerm(tokens, pos);
  if (!first.ok) {
    return first;
  }
  return parseExprTail(tokens, first.value.value, first.value.next);
}

export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const tokens = tuffSource
    .replaceAll("\t", " ")
    .replaceAll("(", " ( ")
    .replaceAll(")", " ) ")
    .replaceAll("+", " + ")
    .replaceAll("-", " - ")
    .replaceAll("*", " * ")
    .split(" ")
    .filter((token) => token !== "");
  const parsed = parseExpr(tokens, 0);
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.value.next !== tokens.length) {
    return invalidAt(
      tokens,
      parsed.value.next,
      "'+', '-', '*', ')', or the end of the input",
      "Remove the extra token, or add an operator before it.",
    );
  }
  return ok(parsed.value.value);
}

// TODO: simple repl with interpretTuff
