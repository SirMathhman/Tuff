export type Span = { start: number; end: number };

export type TuffError =
  | { kind: "UnexpectedCharacter"; span: Span }
  | { kind: "UnexpectedEnd"; span: Span }
  | { kind: "UnexpectedToken"; span: Span }
  | { kind: "ExpectedClosingParen"; span: Span }
  | { kind: "DivisionByZero"; span: Span }
  | { kind: "NumericOverflow"; span: Span }
  | { kind: "NestingTooDeep"; span: Span };

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

type Token = { text: string; span: Span };
type Input = { tokens: Token[]; end: Span };
type Step<T> = Result<{ value: T; next: number }, TuffError>;
type Parser = (input: Input, pos: number, depth: number) => Step<number>;
type OperatorError = "DivisionByZero" | "NumericOverflow";
type BinaryOp = (a: number, b: number) => Result<number, OperatorError>;

const MAX_NESTING_DEPTH = 256;

const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
const err = <E>(error: E): { ok: false; error: E } => ({ ok: false, error });
const finite = (n: number): Result<number, "NumericOverflow"> =>
  Number.isFinite(n) ? ok(n) : err("NumericOverflow");

const ADDITIVE = new Map<string, BinaryOp>([
  ["+", (a, b) => finite(a + b)],
  ["-", (a, b) => finite(a - b)],
]);
const MULTIPLICATIVE = new Map<string, BinaryOp>([
  ["*", (a, b) => finite(a * b)],
  ["/", (a, b) => (b === 0 ? err("DivisionByZero") : ok(Math.trunc(a / b)))],
]);

function tokenize(source: string): Result<Token[], TuffError> {
  const tokens: Token[] = [];
  const pattern = /\s*(\d+|[-+*/(){}])/y;
  let index = 0;
  while (index < source.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(source);
    if (match === null) {
      const rest = source.slice(index);
      const start = index + (rest.length - rest.trimStart().length);
      if (start >= source.length) break;
      return err({ kind: "UnexpectedCharacter", span: { start, end: start + 1 } });
    }
    const text = match[1] ?? "";
    const end = pattern.lastIndex;
    tokens.push({ text, span: { start: end - text.length, end } });
    index = end;
  }
  return ok(tokens);
}

function parseFactor(input: Input, pos: number, depth: number, parseExpr: Parser): Step<number> {
  const token = input.tokens[pos];
  if (token === undefined) return err({ kind: "UnexpectedEnd", span: input.end });
  if (token.text === "(" || token.text === "{") {
    if (depth >= MAX_NESTING_DEPTH) return err({ kind: "NestingTooDeep", span: token.span });
    const closer = token.text === "(" ? ")" : "}";
    const inner = parseExpr(input, pos + 1, depth + 1);
    if (!inner.ok) return inner;
    const close = input.tokens[inner.value.next];
    if (close === undefined) return err({ kind: "UnexpectedEnd", span: input.end });
    if (close.text !== closer) return err({ kind: "ExpectedClosingParen", span: close.span });
    return ok({ value: inner.value.value, next: inner.value.next + 1 });
  }
  if (/^\d+$/.test(token.text)) {
    const value = Number(token.text);
    if (!Number.isFinite(value)) return err({ kind: "NumericOverflow", span: token.span });
    return ok({ value, next: pos + 1 });
  }
  return err({ kind: "UnexpectedToken", span: token.span });
}

function parseBinary(
  input: Input,
  pos: number,
  depth: number,
  level: Map<string, BinaryOp>,
  operand: Parser,
): Step<number> {
  const first = operand(input, pos, depth);
  if (!first.ok) return first;
  let { value, next } = first.value;
  for (;;) {
    const op = input.tokens[next];
    if (op === undefined) return ok({ value, next });
    const fn = level.get(op.text);
    if (fn === undefined) return ok({ value, next });
    const right = operand(input, next + 1, depth);
    if (!right.ok) return right;
    const applied = fn(value, right.value.value);
    if (!applied.ok) return err({ kind: applied.error, span: op.span });
    value = applied.value;
    next = right.value.next;
  }
}

function parseTerm(input: Input, pos: number, depth: number, parseExpr: Parser): Step<number> {
  return parseBinary(input, pos, depth, MULTIPLICATIVE, (i, p, d) => parseFactor(i, p, d, parseExpr));
}

function parseExpression(input: Input, pos: number, depth: number): Step<number> {
  return parseBinary(input, pos, depth, ADDITIVE, (i, p, d) => parseTerm(i, p, d, parseExpression));
}

export function evaluateTuff(source: string): Result<number, TuffError> {
  const tokenized = tokenize(source);
  if (!tokenized.ok) return tokenized;
  const input: Input = { tokens: tokenized.value, end: { start: source.length, end: source.length } };
  const parsed = parseExpression(input, 0, 0);
  if (!parsed.ok) return parsed;
  const extra = input.tokens[parsed.value.next];
  if (extra !== undefined) return err({ kind: "UnexpectedToken", span: extra.span });
  return ok(parsed.value.value);
}
