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

export type TuffError = InvalidTerm | TermTooLarge;

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

type State = "start" | "unary" | "number" | "binary";

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
    expected: "'+', '-', or the end of the input",
    fix: "Join the two numbers with '+' or '-', or remove the extra number.",
  },
  binary: {
    expected: "a number or '-'",
    fix: "Put a number after the operator, or '-' before a negative number.",
  },
};

function nextState(state: State, token: string): State | undefined {
  if (isDigits(token)) {
    return state === "number" ? undefined : "number";
  }
  if (state === "number" && (token === "+" || token === "-")) {
    return "binary";
  }
  if ((state === "start" || state === "binary") && token === "-") {
    return "unary";
  }
  return undefined;
}

interface Scan {
  state: State | undefined;
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

export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const tokens = tuffSource
    .replaceAll("+", " + ")
    .replaceAll("-", " - ")
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
  const { sum } = tokens.reduce(
    (acc, token) => {
      if (isDigits(token)) {
        return { sum: acc.sum + acc.sign * Number(token), sign: 1 };
      }
      if (token === "-") {
        return { sum: acc.sum, sign: -acc.sign };
      }
      return acc;
    },
    { sum: 0, sign: 1 },
  );
  return ok(sum);
}

// TODO: simple repl with interpretTuff
