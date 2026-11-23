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

interface Parsed {
  value: number;
  next: number;
}

type Parse = Result<Parsed, TuffError>;

type ExprRule = (tokens: string[], pos: number, depth: number) => Parse;

const MAX_NESTING_DEPTH = 1000;

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

function nestingTooDeepAt(tokens: string[], index: number): Err<TuffError> {
  return err({
    kind: "NestingTooDeep",
    why: `Parentheses nest deeper than ${MAX_NESTING_DEPTH} levels.`,
    where: whereAt(tokens, index),
    fix: `Reduce the nesting to at most ${MAX_NESTING_DEPTH} levels.`,
  });
}

// Grammar:
//   expr    := term (("+" | "-") term)*
//   term    := factor ("*" factor)*
//   factor  := "-"? primary
//   primary := number | "(" expr ")"
// Each rule returns the value and the index of the next unread token.
// primary receives expr as a parameter, so the rules form no static cycle.

function parsePrimary(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  const token = tokens[pos];
  if (token === "(") {
    if (depth >= MAX_NESTING_DEPTH) {
      return nestingTooDeepAt(tokens, pos);
    }
    const inner = expr(tokens, pos + 1, depth + 1);
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

function parseFactor(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  if (tokens[pos] === "-") {
    const operand = parsePrimary(tokens, pos + 1, depth, expr);
    return operand.ok
      ? ok({ value: -operand.value.value, next: operand.value.next })
      : operand;
  }
  return parsePrimary(tokens, pos, depth, expr);
}

// Folds a left-associative chain: first, then (operator, operand) pairs.
function foldChain(
  tokens: string[],
  first: Parse,
  isOperator: (token: string | undefined) => boolean,
  operand: (pos: number) => Parse,
  apply: (op: string, left: number, right: number) => number,
): Parse {
  if (!first.ok) {
    return first;
  }
  let value = first.value.value;
  let next = first.value.next;
  while (isOperator(tokens[next])) {
    const op = tokens[next] ?? "";
    const right = operand(next + 1);
    if (!right.ok) {
      return right;
    }
    value = apply(op, value, right.value.value);
    if (!Number.isSafeInteger(value)) {
      return resultTooLargeAt(tokens, next);
    }
    next = right.value.next;
  }
  return ok({ value, next });
}

function parseTerm(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  return foldChain(
    tokens,
    parseFactor(tokens, pos, depth, expr),
    (token) => token === "*",
    (next) => parseFactor(tokens, next, depth, expr),
    (_op, left, right) => left * right,
  );
}

function parseExpr(tokens: string[], pos: number, depth: number): Parse {
  return foldChain(
    tokens,
    parseTerm(tokens, pos, depth, parseExpr),
    (token) => token === "+" || token === "-",
    (next) => parseTerm(tokens, next, depth, parseExpr),
    (op, left, right) => (op === "+" ? left + right : left - right),
  );
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
  const parsed = parseExpr(tokens, 0, 0);
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
