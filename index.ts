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

type State = "start" | "unary" | "number" | "binary" | "mul";

interface Guide {
  expected: string;
  fix: string;
}

const GUIDES: Record<State, Guide> = {
  start: {
    expected: "a number or '-'",
    fix: "Start the expression with a number, or with '-' before a number.",
  },
  unary: {
    expected: "a number",
    fix: "Put a number directly after '-'.",
  },
  number: {
    expected: "'+', '-', '*', or the end of the input",
    fix: "Join the two numbers with an operator, or remove the extra number.",
  },
  binary: {
    expected: "a number or '-'",
    fix: "Put a number after the operator, or '-' before a negative number.",
  },
  mul: {
    expected: "a number or '-'",
    fix: "Put a number after '*', or '-' before a negative number.",
  },
};

function nextState(state: State, token: string): State | undefined {
  if (isDigits(token)) {
    return state === "number" ? undefined : "number";
  }
  if (state === "number" && token === "*") {
    return "mul";
  }
  if (state === "number" && (token === "+" || token === "-")) {
    return "binary";
  }
  if (
    (state === "start" || state === "binary" || state === "mul") &&
    token === "-"
  ) {
    return "unary";
  }
  return undefined;
}

interface Scan {
  state?: State;
  failedAt: number;
  expected: State;
}

interface Invalid {
  index: number;
  state: State;
}

// Finds the first token that cannot follow, or the end of the input if the
// expression ends early. Returns undefined when the tokens form a complete
// expression.
function findInvalidToken(tokens: string[]): Invalid | undefined {
  const scan = tokens.reduce<Scan>(
    (acc, token, index) => {
      if (acc.state === undefined) {
        return acc;
      }
      const next = nextState(acc.state, token);
      return next === undefined
        ? { state: undefined, failedAt: index, expected: acc.state }
        : { state: next, failedAt: -1, expected: next };
    },
    { state: "start", failedAt: -1, expected: "start" },
  );
  if (scan.state === undefined) {
    return { index: scan.failedAt, state: scan.expected };
  }
  return scan.state === "number"
    ? undefined
    : { index: tokens.length, state: scan.state };
}

function whereAt(tokens: string[], index: number): ErrorWhere {
  return { index, text: tokens[index] ?? "" };
}

interface Accumulator {
  sum: number;
  term: number;
  sign: number;
  mul: boolean;
  overflowAt: number;
}

// Each "+" or "-" closes the running term; "*" multiplies into it.
function step(acc: Accumulator, tokens: string[], index: number): Accumulator {
  const token = tokens[index] ?? "";
  if (isDigits(token)) {
    const value = acc.sign * Number(token);
    return {
      ...acc,
      term: acc.mul ? acc.term * value : value,
      sign: 1,
      mul: false,
    };
  }
  if (token === "*") {
    return { ...acc, mul: true };
  }
  if (token === "-" && !isDigits(tokens[index - 1] ?? "")) {
    return { ...acc, sign: -acc.sign };
  }
  if (token === "+" || token === "-") {
    return {
      ...acc,
      sum: acc.sum + acc.term,
      term: 0,
      sign: token === "-" ? -1 : 1,
      mul: false,
    };
  }
  return acc;
}

// Records the first index at which the running sum or term leaves the safe range.
function flagOverflow(acc: Accumulator, index: number): Accumulator {
  const safe = Number.isSafeInteger(acc.sum) && Number.isSafeInteger(acc.term);
  return safe || acc.overflowAt !== -1 ? acc : { ...acc, overflowAt: index };
}

export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const tokens = tuffSource
    .replaceAll("\t", " ")
    .replaceAll("+", " + ")
    .replaceAll("-", " - ")
    .replaceAll("*", " * ")
    .split(" ")
    .filter((token) => token !== "");
  const invalid = findInvalidToken(tokens);
  if (invalid !== undefined) {
    const guide = GUIDES[invalid.state];
    const where = whereAt(tokens, invalid.index);
    const found = where.text === "" ? "the end of the input" : JSON.stringify(where.text);
    return err({
      kind: "InvalidTerm",
      why: `Expected ${guide.expected} but found ${found}.`,
      where,
      fix: guide.fix,
    });
  }
  const tooLargeIndex = tokens.findIndex(
    (token) => isDigits(token) && Number(token) > Number.MAX_SAFE_INTEGER,
  );
  if (tooLargeIndex !== -1) {
    const where = whereAt(tokens, tooLargeIndex);
    return err({
      kind: "TermTooLarge",
      why: `${JSON.stringify(where.text)} is larger than ${Number.MAX_SAFE_INTEGER}, so it cannot be stored exactly.`,
      where,
      fix: `Use an integer of at most ${Number.MAX_SAFE_INTEGER}.`,
    });
  }
  const result = tokens.reduce(
    (acc, _token, index) => flagOverflow(step(acc, tokens, index), index),
    { sum: 0, term: 0, sign: 1, mul: false, overflowAt: -1 },
  );
  const total = result.sum + result.term;
  const overflowAt =
    result.overflowAt !== -1
      ? result.overflowAt
      : Number.isSafeInteger(total)
        ? -1
        : tokens.length - 1;
  if (overflowAt !== -1) {
    return err({
      kind: "ResultTooLarge",
      why: `The running value leaves the safe integer range (±${Number.MAX_SAFE_INTEGER}), so its digits can no longer be stored exactly.`,
      where: whereAt(tokens, overflowAt),
      fix: `Keep every intermediate and final result within ±${Number.MAX_SAFE_INTEGER}, for example by splitting the calculation.`,
    });
  }
  return ok(total);
}

// TODO: simple repl with interpretTuff
