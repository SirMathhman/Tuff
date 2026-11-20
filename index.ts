export interface Span {
  start: number;
  end: number;
}

export enum TuffErrorKind {
  UnexpectedCharacter = "UnexpectedCharacter",
  UnexpectedEnd = "UnexpectedEnd",
  UnexpectedToken = "UnexpectedToken",
  ExpectedClosingParen = "ExpectedClosingParen",
  DivisionByZero = "DivisionByZero",
  NumericOverflow = "NumericOverflow",
  NestingTooDeep = "NestingTooDeep",
  UnknownName = "UnknownName",
  DuplicateName = "DuplicateName",
}

export interface TuffErrorOf<K extends TuffErrorKind> {
  kind: K;
  span: Span;
}

export type TuffError =
  | TuffErrorOf<TuffErrorKind.UnexpectedCharacter>
  | TuffErrorOf<TuffErrorKind.UnexpectedEnd>
  | TuffErrorOf<TuffErrorKind.UnexpectedToken>
  | TuffErrorOf<TuffErrorKind.ExpectedClosingParen>
  | TuffErrorOf<TuffErrorKind.DivisionByZero>
  | TuffErrorOf<TuffErrorKind.NumericOverflow>
  | TuffErrorOf<TuffErrorKind.NestingTooDeep>
  | TuffErrorOf<TuffErrorKind.UnknownName>
  | TuffErrorOf<TuffErrorKind.DuplicateName>;

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<E> {
  ok: false;
  error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

interface Token {
  text: string;
  span: Span;
}

interface Input {
  tokens: Token[];
  end: Span;
}

interface Parsed<T> {
  value: T;
  next: number;
}

interface Scope {
  locals: Map<string, number>;
  outer: Scope | undefined;
}

type Step<T> = Result<Parsed<T>, TuffError>;
type Parser = (input: Input, pos: number, depth: number, scope: Scope | undefined) => Step<number>;
type OperatorError = TuffErrorKind.DivisionByZero | TuffErrorKind.NumericOverflow;
type BinaryOp = (a: number, b: number) => Result<number, OperatorError>;

const MAX_NESTING_DEPTH = 256;

function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

function finite(n: number): Result<number, TuffErrorKind.NumericOverflow> {
  return Number.isFinite(n) ? ok(n) : err(TuffErrorKind.NumericOverflow);
}

const ADDITIVE = new Map<string, BinaryOp>([
  ["+", (a, b) => finite(a + b)],
  ["-", (a, b) => finite(a - b)],
]);
const MULTIPLICATIVE = new Map<string, BinaryOp>([
  ["*", (a, b) => finite(a * b)],
  ["/", (a, b) => (b === 0 ? err(TuffErrorKind.DivisionByZero) : ok(Math.trunc(a / b)))],
]);

function tokenize(source: string): Result<Token[], TuffError> {
  const tokens: Token[] = [];
  const pattern = /\s*(\d+|[A-Za-z]+|[-+*/(){}=;])/y;
  let index = 0;
  while (index < source.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(source);
    if (match === null) {
      const rest = source.slice(index);
      const start = index + (rest.length - rest.trimStart().length);
      if (start >= source.length) break;
      return err({ kind: TuffErrorKind.UnexpectedCharacter, span: { start, end: start + 1 } });
    }
    const text = match[1] ?? "";
    const end = pattern.lastIndex;
    tokens.push({ text, span: { start: end - text.length, end } });
    index = end;
  }
  return ok(tokens);
}

function isName(text: string): boolean {
  return /^[A-Za-z]+$/.test(text) && text !== "let";
}

function lookup(scope: Scope | undefined, name: string): number | undefined {
  let current = scope;
  while (current !== undefined) {
    const value = current.locals.get(name);
    if (value !== undefined) return value;
    current = current.outer;
  }
  return undefined;
}

function parseBlock(
  input: Input,
  pos: number,
  depth: number,
  scope: Scope | undefined,
  parseExpr: Parser,
): Step<number> {
  const locals = new Map<string, number>();
  const inner: Scope = { locals, outer: scope };
  let cursor = pos;
  for (;;) {
    const token = input.tokens[cursor];
    if (token === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
    if (token.text !== "let") return parseExpr(input, cursor, depth, inner);

    const nameToken = input.tokens[cursor + 1];
    if (nameToken === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
    if (!isName(nameToken.text)) return err({ kind: TuffErrorKind.UnexpectedToken, span: nameToken.span });
    if (locals.has(nameToken.text)) return err({ kind: TuffErrorKind.DuplicateName, span: nameToken.span });

    const equals = input.tokens[cursor + 2];
    if (equals === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
    if (equals.text !== "=") return err({ kind: TuffErrorKind.UnexpectedToken, span: equals.span });

    const rhs = parseExpr(input, cursor + 3, depth, inner);
    if (!rhs.ok) return rhs;
    const semicolon = input.tokens[rhs.value.next];
    if (semicolon === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
    if (semicolon.text !== ";") return err({ kind: TuffErrorKind.UnexpectedToken, span: semicolon.span });
    locals.set(nameToken.text, rhs.value.value);
    cursor = rhs.value.next + 1;
  }
}

function parseFactor(
  input: Input,
  pos: number,
  depth: number,
  scope: Scope | undefined,
  parseExpr: Parser,
): Step<number> {
  const token = input.tokens[pos];
  if (token === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
  if (token.text === "(" || token.text === "{") {
    if (depth >= MAX_NESTING_DEPTH) return err({ kind: TuffErrorKind.NestingTooDeep, span: token.span });
    const isBlock = token.text === "{";
    const closer = isBlock ? "}" : ")";
    const inner = isBlock
      ? parseBlock(input, pos + 1, depth + 1, scope, parseExpr)
      : parseExpr(input, pos + 1, depth + 1, scope);
    if (!inner.ok) return inner;
    const close = input.tokens[inner.value.next];
    if (close === undefined) return err({ kind: TuffErrorKind.UnexpectedEnd, span: input.end });
    if (close.text !== closer) {
      return err({ kind: TuffErrorKind.ExpectedClosingParen, span: close.span });
    }
    return ok({ value: inner.value.value, next: inner.value.next + 1 });
  }
  if (/^\d+$/.test(token.text)) {
    const value = Number(token.text);
    if (!Number.isFinite(value)) return err({ kind: TuffErrorKind.NumericOverflow, span: token.span });
    return ok({ value, next: pos + 1 });
  }
  if (isName(token.text)) {
    const value = lookup(scope, token.text);
    if (value === undefined) return err({ kind: TuffErrorKind.UnknownName, span: token.span });
    return ok({ value, next: pos + 1 });
  }
  return err({ kind: TuffErrorKind.UnexpectedToken, span: token.span });
}

function parseBinary(
  input: Input,
  pos: number,
  depth: number,
  scope: Scope | undefined,
  level: Map<string, BinaryOp>,
  operand: Parser,
): Step<number> {
  const first = operand(input, pos, depth, scope);
  if (!first.ok) return first;
  let { value, next } = first.value;
  for (;;) {
    const op = input.tokens[next];
    if (op === undefined) return ok({ value, next });
    const fn = level.get(op.text);
    if (fn === undefined) return ok({ value, next });
    const right = operand(input, next + 1, depth, scope);
    if (!right.ok) return right;
    const applied = fn(value, right.value.value);
    if (!applied.ok) return err({ kind: applied.error, span: op.span });
    value = applied.value;
    next = right.value.next;
  }
}

function parseTerm(input: Input, pos: number, depth: number, scope: Scope | undefined, parseExpr: Parser): Step<number> {
  return parseBinary(input, pos, depth, scope, MULTIPLICATIVE, (i, p, d, s) => parseFactor(i, p, d, s, parseExpr));
}

function parseExpression(input: Input, pos: number, depth: number, scope: Scope | undefined): Step<number> {
  return parseBinary(input, pos, depth, scope, ADDITIVE, (i, p, d, s) => parseTerm(i, p, d, s, parseExpression));
}

export function evaluateTuff(source: string): Result<number, TuffError> {
  const tokenized = tokenize(source);
  if (!tokenized.ok) return tokenized;
  const input: Input = { tokens: tokenized.value, end: { start: source.length, end: source.length } };
  const parsed = parseExpression(input, 0, 0, undefined);
  if (!parsed.ok) return parsed;
  const extra = input.tokens[parsed.value.next];
  if (extra !== undefined) return err({ kind: TuffErrorKind.UnexpectedToken, span: extra.span });
  return ok(parsed.value.value);
}
