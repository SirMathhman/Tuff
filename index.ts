export interface TuffError {
  what: string;
  where: number;
  why: string;
  fix: string;
}

export interface Success<T> {
  ok: true;
  value: T;
}

export interface Failure<E> {
  ok: false;
  error: E;
}

export type Result<T, E> = Success<T> | Failure<E>;

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function isSpace(c: string): boolean {
  return c.length === 1 && c.trim() === "";
}

function skipSpaces(source: string, pos: number): number {
  let i = pos;
  while (isSpace(source.charAt(i))) i++;
  return i;
}

function describe(c: string): string {
  if (c === "") return "the end of the input";
  if (isSpace(c)) return "whitespace";
  return `'${c}'`;
}

function expectedNumber(source: string, where: number): Failure<TuffError> {
  return {
    ok: false,
    error: {
      what: `Expected a number but found ${describe(source.charAt(where))}`,
      where,
      why: "Every '+' or '-' must be followed by an integer, and an expression must start with one.",
      fix: "Put an integer at this position, or remove the operator before it.",
    },
  };
}

function expectedOperator(source: string, where: number): Failure<TuffError> {
  return {
    ok: false,
    error: {
      what: `Expected '+' or '-' but found ${describe(source.charAt(where))}`,
      where,
      why: "Two numbers can only be combined with '+' or '-'; any other character cannot follow a number.",
      fix: "Insert '+' or '-' between the numbers, or remove the extra character.",
    },
  };
}

// Grammar: [sign] digits ( ws* ("+" | "-") ws* [sign] digits )*, where a sign
// must touch its digits. Offsets in errors refer to the unmodified source.
export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  let pos = skipSpaces(tuffSource, 0);
  let total = 0;
  let termSign = 1; // sign from the binary operator before the next term
  for (;;) {
    let sign = termSign;
    const c = tuffSource.charAt(pos);
    if (c === "+" || c === "-") {
      if (c === "-") sign = -sign;
      pos++;
    }

    const start = pos;
    while (isDigit(tuffSource.charAt(pos))) pos++;
    if (pos === start) return expectedNumber(tuffSource, pos);
    total += sign * parseInt(tuffSource.slice(start, pos), 10);

    pos = skipSpaces(tuffSource, pos);
    if (pos === tuffSource.length) return { ok: true, value: total };

    const op = tuffSource.charAt(pos);
    if (op !== "+" && op !== "-") return expectedOperator(tuffSource, pos);
    termSign = op === "-" ? -1 : 1;
    pos = skipSpaces(tuffSource, pos + 1);
  }
}
