export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<E> {
  ok: false;
  error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export enum EvaluateErrorKind {
  ParseError = "ParseError",
}

export interface EvaluateError {
  kind: EvaluateErrorKind;
  input: string;
  position: number;
  message: string;
}

const NUMBER_PATTERN = /^(\d+(\.\d*)?|\.\d+)/;

function skipWhitespace(input: string, pos: number): number {
  while (pos < input.length && /\s/.test(input.charAt(pos))) {
    pos++;
  }
  return pos;
}

function parseNumber(
  input: string,
  pos: number,
): Result<[number, number], number> {
  const match = NUMBER_PATTERN.exec(input.slice(pos));
  if (!match) {
    return { ok: false, error: pos };
  }
  return { ok: true, value: [Number(match[0]), pos + match[0].length] };
}

function parseFactor(
  input: string,
  pos: number,
): Result<[number, number], number> {
  pos = skipWhitespace(input, pos);
  if (input[pos] === "-") {
    const inner = parseFactor(input, pos + 1);
    if (!inner.ok) {
      return inner;
    }
    return { ok: true, value: [-inner.value[0], inner.value[1]] };
  }
  return parseNumber(input, pos);
}

function parseTerm(
  input: string,
  pos: number,
): Result<[number, number], number> {
  const first = parseFactor(input, pos);
  if (!first.ok) {
    return first;
  }
  let [value, next] = first.value;
  for (;;) {
    const opPos = skipWhitespace(input, next);
    if (input.charAt(opPos) !== "*") {
      break;
    }
    const right = parseFactor(input, opPos + 1);
    if (!right.ok) {
      return right;
    }
    value *= right.value[0];
    next = right.value[1];
  }
  return { ok: true, value: [value, next] };
}

function parseExpression(
  input: string,
  pos: number,
): Result<[number, number], number> {
  const first = parseTerm(input, pos);
  if (!first.ok) {
    return first;
  }
  let [value, next] = first.value;
  for (;;) {
    const opPos = skipWhitespace(input, next);
    const op = input.charAt(opPos);
    if (op !== "+" && op !== "-") {
      break;
    }
    const right = parseTerm(input, opPos + 1);
    if (!right.ok) {
      return right;
    }
    value = op === "+" ? value + right.value[0] : value - right.value[0];
    next = right.value[1];
  }
  return { ok: true, value: [value, next] };
}

function parseError(
  input: string,
  position: number,
  reason: string,
): EvaluateError {
  return {
    kind: EvaluateErrorKind.ParseError,
    input,
    position,
    message:
      `evaluate() failed to parse ${JSON.stringify(input)}: ${reason} at position ${position}. ` +
      'Provide an expression of numeric literals combined with "+", "-", and "*" (e.g. "1 + 2").',
  };
}

export function evaluate(input: string): Result<number, EvaluateError> {
  const start = skipWhitespace(input, 0);
  if (start === input.length) {
    return { ok: true, value: 0 };
  }
  const parsed = parseExpression(input, start);
  if (!parsed.ok) {
    return {
      ok: false,
      error: parseError(input, parsed.error, "expected a number"),
    };
  }
  const [value, end] = parsed.value;
  const rest = skipWhitespace(input, end);
  if (rest < input.length) {
    return {
      ok: false,
      error: parseError(
        input,
        rest,
        `unexpected character ${JSON.stringify(input[rest])}`,
      ),
    };
  }
  return { ok: true, value };
}
