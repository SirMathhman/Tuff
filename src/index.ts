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

interface ParseFailure {
  position: number;
  reason: string;
}

function parseNumber(
  input: string,
  pos: number,
): Result<[number, number], ParseFailure> {
  const match = NUMBER_PATTERN.exec(input.slice(pos));
  if (!match) {
    return { ok: false, error: { position: pos, reason: "expected a number" } };
  }
  return { ok: true, value: [Number(match[0]), pos + match[0].length] };
}

function parseFactor(
  input: string,
  pos: number,
): Result<[number, number], ParseFailure> {
  pos = skipWhitespace(input, pos);
  if (input[pos] === "-") {
    const inner = parseFactor(input, pos + 1);
    if (!inner.ok) {
      return inner;
    }
    return { ok: true, value: [-inner.value[0], inner.value[1]] };
  }
  if (input[pos] === "(") {
    const inner = parseExpression(input, pos + 1);
    if (!inner.ok) {
      return inner;
    }
    const closePos = skipWhitespace(input, inner.value[1]);
    if (input.charAt(closePos) !== ")") {
      return {
        ok: false,
        error: { position: closePos, reason: "expected ')'" },
      };
    }
    return { ok: true, value: [inner.value[0], closePos + 1] };
  }
  return parseNumber(input, pos);
}

function parseTerm(
  input: string,
  pos: number,
): Result<[number, number], ParseFailure> {
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
): Result<[number, number], ParseFailure> {
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
      'Provide an expression of numeric literals combined with "+", "-", and "*" (e.g. "1 + 2"), optionally grouped with parentheses (e.g. "(1 + 2) * 3").',
  };
}

const MAX_PAREN_DEPTH = 1000;

function parenDepthError(input: string): ParseFailure | null {
  let depth = 0;
  let maxDepth = 0;
  let maxDepthPos = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === "(") {
      depth++;
      if (depth > maxDepth) {
        maxDepth = depth;
        maxDepthPos = i;
      }
    } else if (input[i] === ")") {
      depth--;
    }
  }
  if (maxDepth <= MAX_PAREN_DEPTH) {
    return null;
  }
  return { position: maxDepthPos, reason: "expression nesting too deep" };
}

export function evaluate(input: string): Result<number, EvaluateError> {
  const start = skipWhitespace(input, 0);
  if (start === input.length) {
    return { ok: true, value: 0 };
  }
  const tooDeep = parenDepthError(input);
  if (tooDeep) {
    return {
      ok: false,
      error: parseError(input, tooDeep.position, tooDeep.reason),
    };
  }
  const parsed = parseExpression(input, start);
  if (!parsed.ok) {
    return {
      ok: false,
      error: parseError(input, parsed.error.position, parsed.error.reason),
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
