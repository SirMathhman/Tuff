import { ok, err, type Err, type ErrorWhere, type Result, type TuffError } from "./errors.ts";

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
export interface Parsed {
  value: Expr;
  next: number;
}
export type Parse = Result<Parsed, TuffError>;
export type ExprRule = (tokens: string[], pos: number, depth: number) => Parse;
export const MAX_NESTING_DEPTH = 1000;
export function isDigits(text: string): boolean {
  return (
    text.length > 0 && [...text].every((char) => char >= "0" && char <= "9")
  );
}
export function whereAt(tokens: string[], index: number): ErrorWhere {
  return { index, text: tokens[index] ?? "" };
}
export function invalidAt(
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
export function termTooLargeAt(tokens: string[], index: number): Err<TuffError> {
  const where = whereAt(tokens, index);
  return err({
    kind: "TermTooLarge",
    why: `${JSON.stringify(where.text)} is larger than ${Number.MAX_SAFE_INTEGER}, so it cannot be stored exactly.`,
    where,
    fix: `Use an integer of at most ${Number.MAX_SAFE_INTEGER}.`,
  });
}
export function nestingTooDeepAt(tokens: string[], index: number): Err<TuffError> {
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

export function operatorAt(
  token: string | undefined,
  allowed: Link["op"][],
): Link["op"] | undefined {
  return allowed.find((candidate) => candidate === token);
}
// Grammar:
//   expr    := term (("+" | "-") term)*
//   term    := factor ("*" factor)*
//   factor  := "-"? primary
//   primary := number | "(" expr ")" | "{" expr "}"
// The parser builds an AST; evaluate computes the value.
// primary receives expr as a parameter, so the rules form no static cycle.

export function parseChain(
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
// Grammar:
//   expr    := term (("+" | "-") term)*
//   term    := factor ("*" factor)*
//   factor  := "-"? primary
//   primary := number | "(" expr ")" | "{" expr "}"
// The parser builds an AST; evaluate computes the value.
// primary receives expr as a parameter, so the rules form no static cycle.

export function parsePrimary(
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
// Grammar:
//   expr    := term (("+" | "-") term)*
//   term    := factor ("*" factor)*
//   factor  := "-"? primary
//   primary := number | "(" expr ")" | "{" expr "}"
// The parser builds an AST; evaluate computes the value.
// primary receives expr as a parameter, so the rules form no static cycle.

export function parseFactor(
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
// Grammar:
//   expr    := term (("+" | "-") term)*
//   term    := factor ("*" factor)*
//   factor  := "-"? primary
//   primary := number | "(" expr ")" | "{" expr "}"
// The parser builds an AST; evaluate computes the value.
// primary receives expr as a parameter, so the rules form no static cycle.

export function parseTerm(
  tokens: string[],
  pos: number,
  depth: number,
  expr: ExprRule,
): Parse {
  return parseChain(tokens, pos, ["*"], (next) =>
    parseFactor(tokens, next, depth, expr),
  );
}
// Grammar:
//   expr    := term (("+" | "-") term)*
//   term    := factor ("*" factor)*
//   factor  := "-"? primary
//   primary := number | "(" expr ")" | "{" expr "}"
// The parser builds an AST; evaluate computes the value.
// primary receives expr as a parameter, so the rules form no static cycle.

export function parseExpr(tokens: string[], pos: number, depth: number): Parse {
  return parseChain(tokens, pos, ["+", "-"], (next) =>
    parseTerm(tokens, next, depth, parseExpr),
  );
}
