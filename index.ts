interface TuffError {
  what: string;
  where: number;
  why: string;
  fix: string;
}

interface Success<T> {
  ok: true;
  value: T;
}

interface Failure<E> {
  ok: false;
  error: E;
}

type Result<T, E> = Success<T> | Failure<E>;

interface Parsed {
  value: number;
  end: number;
}

// Parses a parenthesized group whose "(" sits just before `start`.
type GroupParser = (source: string, start: number) => Result<Parsed, TuffError>;

// Deeper nesting is reported as a TuffError rather than exhausting the call stack.
const MAX_NESTING_DEPTH = 256;

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

function fail(what: string, where: number, why: string, fix: string): Failure<TuffError> {
  return { ok: false, error: { what, where, why, fix } };
}

function expectedNumber(source: string, where: number): Failure<TuffError> {
  return fail(
    `Expected a number or '(' but found ${describe(source.charAt(where))}`,
    where,
    "Every '+', '-', or '*' must be followed by an integer or a parenthesized expression, and an expression must start with one.",
    "Put an integer or '(' at this position, or remove the operator before it.",
  );
}

function expectedOperator(source: string, where: number, grouped: boolean): Failure<TuffError> {
  const found = describe(source.charAt(where));
  if (grouped) {
    return fail(
      `Expected '+', '-', '*', or ')' but found ${found}`,
      where,
      "Two terms can only be combined with '+', '-', or '*', and a '(' must be closed with ')'; any other character cannot follow a number.",
      "Insert '+', '-', '*', or ')' here, or remove the extra character.",
    );
  }
  return fail(
    `Expected '+', '-', or '*' but found ${found}`,
    where,
    "Two numbers can only be combined with '+', '-', or '*'; any other character cannot follow a number.",
    "Insert '+', '-', or '*' between the numbers, or remove the extra character.",
  );
}

function expectedClose(source: string, where: number): Failure<TuffError> {
  return fail(
    `Expected ')' but found ${describe(source.charAt(where))}`,
    where,
    "Every '(' must be closed by a matching ')'.",
    "Add a ')' at the end of the parenthesized expression.",
  );
}

// factor: [sign] (digits | "(" expression ")")
function parseFactor(source: string, start: number, parseGroup: GroupParser): Result<Parsed, TuffError> {
  let pos = start;
  let sign = 1;
  const c = source.charAt(pos);
  if (c === "+" || c === "-") {
    if (c === "-") sign = -1;
    pos++;
  }

  if (source.charAt(pos) === "(") {
    const inner = parseGroup(source, pos + 1);
    if (!inner.ok) return inner;
    return { ok: true, value: { value: sign * inner.value.value, end: inner.value.end + 1 } };
  }

  const digitsStart = pos;
  while (isDigit(source.charAt(pos))) pos++;
  if (pos === digitsStart) return expectedNumber(source, pos);
  return {
    ok: true,
    value: { value: sign * parseInt(source.slice(digitsStart, pos), 10), end: pos },
  };
}

// term: factor ( "*" factor )*
function parseTerm(source: string, start: number, parseGroup: GroupParser): Result<Parsed, TuffError> {
  const first = parseFactor(source, start, parseGroup);
  if (!first.ok) return first;
  let value = first.value.value;
  let pos = skipSpaces(source, first.value.end);

  while (source.charAt(pos) === "*") {
    const next = parseFactor(source, skipSpaces(source, pos + 1), parseGroup);
    if (!next.ok) return next;
    value *= next.value.value;
    pos = skipSpaces(source, next.value.end);
  }
  return { ok: true, value: { value, end: pos } };
}

// expression: term ( ("+" | "-") term )*. When depth > 0 it is inside parentheses:
// it stops before ")" and the returned end points at that ")". Offsets refer to
// the unmodified source.
function parseExpression(source: string, start: number, depth: number): Result<Parsed, TuffError> {
  const grouped = depth > 0;
  // Passing the group parser down keeps parseFactor and parseTerm free of a
  // direct dependency on parseExpression.
  const parseGroup: GroupParser = (s, p) => {
    if (depth + 1 > MAX_NESTING_DEPTH) {
      return fail(
        `Parentheses are nested more than ${MAX_NESTING_DEPTH} levels deep`,
        p - 1,
        "Each '(' adds a level of nesting, and nesting beyond the limit cannot be evaluated safely.",
        "Remove some parentheses or split the expression.",
      );
    }
    return parseExpression(s, p, depth + 1);
  };

  let pos = skipSpaces(source, start);
  let total = 0;
  let termSign = 1; // sign from the additive operator before the next term
  for (;;) {
    const term = parseTerm(source, pos, parseGroup);
    if (!term.ok) return term;
    total += termSign * term.value.value;
    pos = term.value.end;

    if (pos === source.length) {
      if (grouped) return expectedClose(source, pos);
      return { ok: true, value: { value: total, end: pos } };
    }

    const op = source.charAt(pos);
    if (grouped && op === ")") return { ok: true, value: { value: total, end: pos } };
    if (op !== "+" && op !== "-") return expectedOperator(source, pos, grouped);
    termSign = op === "-" ? -1 : 1;
    pos = skipSpaces(source, pos + 1);
  }
}

export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const result = parseExpression(tuffSource, 0, 0);
  if (!result.ok) return result;
  return { ok: true, value: result.value.value };
}
