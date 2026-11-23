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

export interface NumberNode {
  kind: "number";
  value: number;
}

export interface NegateNode {
  kind: "negate";
  operand: Expr;
}

export interface Link {
  op: "+" | "-" | "*";
  operand: Expr;
  where: ErrorWhere;
}

export interface ChainNode {
  kind: "chain";
  first: Expr;
  links: Link[];
}

export type Expr = NumberNode | NegateNode | ChainNode;

interface Parsed {
  value: Expr;
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

function tokenize(tuffSource: string): string[] {
  return tuffSource
    .replaceAll("\t", " ")
    .replaceAll("(", " ( ")
    .replaceAll(")", " ) ")
    .replaceAll("{", " { ")
    .replaceAll("}", " } ")
    .replaceAll("+", " + ")
    .replaceAll("-", " - ")
    .replaceAll("*", " * ")
    .split(" ")
    .filter((token) => token !== "");
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

function resultTooLargeAt(where: ErrorWhere): Err<TuffError> {
  return err({
    kind: "ResultTooLarge",
    why: `The running value leaves the safe integer range (±${Number.MAX_SAFE_INTEGER}), so its digits can no longer be stored exactly.`,
    where,
    fix: `Keep every intermediate and final result within ±${Number.MAX_SAFE_INTEGER}, for example by splitting the calculation.`,
  });
}

function nestingTooDeepAt(tokens: string[], index: number): Err<TuffError> {
  return err({
    kind: "NestingTooDeep",
    why: `Groups nest deeper than ${MAX_NESTING_DEPTH} levels.`,
    where: whereAt(tokens, index),
    fix: `Reduce the nesting to at most ${MAX_NESTING_DEPTH} levels.`,
  });
}

// Grammar:
//   expr    := term (("+" | "-") term)*
//   term    := factor ("*" factor)*
//   factor  := "-"? primary
//   primary := number | "(" expr ")" | "{" expr "}"
// The parser builds an AST; evaluate computes the value.
// primary receives expr as a parameter, so the rules form no static cycle.

function operatorAt(
  token: string | undefined,
  allowed: Link["op"][],
): Link["op"] | undefined {
  return allowed.find((candidate) => candidate === token);
}

function parseChain(
  tokens: string[],
  pos: number,
  allowed: Link["op"][],
  operand: (next: number) => Parse,
): Parse {
  const first = operand(pos);
  if (!first.ok) {
    return first;
  }
  const links: Link[] = [];
  let next = first.value.next;
  let op = operatorAt(tokens[next], allowed);
  while (op !== undefined) {
    const right = operand(next + 1);
    if (!right.ok) {
      return right;
    }
    links.push({ op, operand: right.value.value, where: whereAt(tokens, next) });
    next = right.value.next;
    op = operatorAt(tokens[next], allowed);
  }
  return ok({
    value: links.length === 0 ? first.value.value : { kind: "chain", first: first.value.value, links },
    next,
  });
}

function parsePrimary(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  const token = tokens[pos];
  if (token === "(" || token === "{") {
    if (depth >= MAX_NESTING_DEPTH) {
      return nestingTooDeepAt(tokens, pos);
    }
    const closer = token === "(" ? ")" : "}";
    const inner = expr(tokens, pos + 1, depth + 1);
    if (!inner.ok) {
      return inner;
    }
    if (tokens[inner.value.next] !== closer) {
      return invalidAt(
        tokens,
        inner.value.next,
        `'${closer}'`,
        `Close the group with '${closer}'.`,
      );
    }
    return ok({ value: inner.value.value, next: inner.value.next + 1 });
  }
  if (token !== undefined && isDigits(token)) {
    if (Number(token) > Number.MAX_SAFE_INTEGER) {
      return termTooLargeAt(tokens, pos);
    }
    return ok({ value: { kind: "number", value: Number(token) }, next: pos + 1 });
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
      ? ok({ value: { kind: "negate", operand: operand.value.value }, next: operand.value.next })
      : operand;
  }
  return parsePrimary(tokens, pos, depth, expr);
}

function parseTerm(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  return parseChain(tokens, pos, ["*"], (next) =>
    parseFactor(tokens, next, depth, expr),
  );
}

function parseExpr(tokens: string[], pos: number, depth: number): Parse {
  return parseChain(tokens, pos, ["+", "-"], (next) =>
    parseTerm(tokens, next, depth, parseExpr),
  );
}

function apply(op: Link["op"], left: number, right: number): number {
  if (op === "+") {
    return left + right;
  }
  return op === "-" ? left - right : left * right;
}

function evaluate(expr: Expr): Result<number, TuffError> {
  if (expr.kind === "number") {
    return ok(expr.value);
  }
  if (expr.kind === "negate") {
    const inner = evaluate(expr.operand);
    return inner.ok ? ok(-inner.value) : inner;
  }
  return expr.links.reduce<Result<number, TuffError>>(
    (acc, link) => {
      if (!acc.ok) {
        return acc;
      }
      const right = evaluate(link.operand);
      if (!right.ok) {
        return right;
      }
      const value = apply(link.op, acc.value, right.value);
      return Number.isSafeInteger(value) ? ok(value) : resultTooLargeAt(link.where);
    },
    evaluate(expr.first),
  );
}

export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const tokens = tokenize(tuffSource);
  const parsed = parseExpr(tokens, 0, 0);
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.value.next !== tokens.length) {
    return invalidAt(
      tokens,
      parsed.value.next,
      "'+', '-', '*', a closing ')' or '}', or the end of the input",
      "Remove the extra token, or add an operator before it.",
    );
  }
  return evaluate(parsed.value.value);
}

// TODO: simple repl with interpretTuff
