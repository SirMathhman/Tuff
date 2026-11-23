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

export interface TermTooLarge {
  kind: "TermTooLarge";
  term: string;
  index: number;
}

export type TuffError = InvalidTerm | TermTooLarge;

export function describeError(error: TuffError): string {
  return error.kind === "InvalidTerm"
    ? `Invalid term ${JSON.stringify(error.term)} at index ${error.index}`
    : `Term ${JSON.stringify(error.term)} at index ${error.index} is too large to be exact`;
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
}

// Returns the index of the first token that cannot follow, tokens.length if
// the input ends early, or -1 if the tokens form a complete expression.
function findInvalidToken(tokens: string[]): number {
  const scan = tokens.reduce<Scan>(
    (acc, token, index) => {
      if (acc.state === undefined) {
        return acc;
      }
      const next = nextState(acc.state, token);
      return next === undefined
        ? { state: undefined, failedAt: index }
        : { state: next, failedAt: -1 };
    },
    { state: "start", failedAt: -1 },
  );
  if (scan.state === undefined) {
    return scan.failedAt;
  }
  return scan.state === "number" ? -1 : tokens.length;
}

export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const tokens = tuffSource
    .replaceAll("+", " + ")
    .replaceAll("-", " - ")
    .split(" ")
    .filter((token) => token !== "");
  const invalidIndex = findInvalidToken(tokens);
  if (invalidIndex !== -1) {
    return err({
      kind: "InvalidTerm",
      term: tokens[invalidIndex] ?? "",
      index: invalidIndex,
    });
  }
  const tooLargeIndex = tokens.findIndex(
    (token) => isDigits(token) && Number(token) > Number.MAX_SAFE_INTEGER,
  );
  if (tooLargeIndex !== -1) {
    return err({
      kind: "TermTooLarge",
      term: tokens[tooLargeIndex] ?? "",
      index: tooLargeIndex,
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
