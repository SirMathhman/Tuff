import { numberAsBoolean } from "../errors.ts";
import { err, ok } from "../result.ts";
import type { Operand, Scope } from "../scope.ts";
import { signAt, textAt } from "../tokenize.ts";
import type { Token } from "../tokenize.ts";
import { numberFrom, parseTerm } from "./term.ts";
import type { ParseResult, Parsed, Parser } from "./types.ts";

// Parses an optional leading sign, then terms joined by "+" or "-". Stops
// before the first token that is not "+" or "-"; the caller decides whether
// that token is valid there. A single term keeps a boolean value; a sum needs
// numbers.
function parseSum(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Parsed> {
  const leadingSign = signAt(tokens, index);
  const firstIndex = leadingSign === undefined ? index : index + 1;
  const first = parseTerm(
    tokens,
    firstIndex,
    leadingSign ?? 0,
    scope,
    end,
    factor,
  );
  if (!first.ok) {
    return first;
  }
  let next = first.value.next;
  let current = first.value.scope;

  let sign = signAt(tokens, next);
  if (sign === undefined) {
    return ok({ value: first.value.value, next, scope: current });
  }
  const firstValue = numberFrom(
    first.value.value,
    tokens[firstIndex]?.pos ?? end,
    textAt(tokens, firstIndex),
  );
  if (!firstValue.ok) {
    return firstValue;
  }
  let sum = firstValue.value;
  while (sign !== undefined) {
    const term = parseTerm(tokens, next + 1, sign, current, end, factor);
    if (!term.ok) {
      return term;
    }
    const termValue = numberFrom(
      term.value.value,
      tokens[next + 1]?.pos ?? end,
      textAt(tokens, next + 1),
    );
    if (!termValue.ok) {
      return termValue;
    }
    sum += termValue.value;
    next = term.value.next;
    current = term.value.scope;
    sign = signAt(tokens, next);
  }

  return ok({ value: sum, next, scope: current });
}

// A parser for one operand of a boolean operator. It takes the factor parser, as
// parseSum does.
type OperandParser = (
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
) => ParseResult<Parsed>;

// Parses operands joined by one boolean operator, left to right. Both sides must
// be booleans. The right side is skipped when the left side already decides the
// result: true for "||", false for "&&". Its assignments are then discarded,
// though its errors are still reported.
function parseChain(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
  joiner: "or" | "and",
  operand: OperandParser,
): ParseResult<Parsed> {
  const symbol = joiner === "or" ? "||" : "&&";
  const left = operand(tokens, index, scope, end, factor);
  if (!left.ok) {
    return left;
  }
  let value: Operand = left.value.value;
  let next = left.value.next;
  let current = left.value.scope;
  let joinToken = tokens[next];
  while (joinToken?.kind === joiner) {
    const right = operand(tokens, next + 1, current, end, factor);
    if (!right.ok) {
      return right;
    }
    const rightValue = right.value.value;
    if (typeof value !== "boolean" || typeof rightValue !== "boolean") {
      return err(numberAsBoolean(joinToken.pos, symbol));
    }
    const decided = joiner === "or" ? value : !value;
    if (!decided) {
      value = rightValue;
      current = right.value.scope;
    }
    next = right.value.next;
    joinToken = tokens[next];
  }
  return ok({ value, next, scope: current });
}

// Parses sums joined by "&&". "&&" binds tighter than "||".
function parseAnd(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Parsed> {
  return parseChain(tokens, index, scope, end, factor, "and", parseSum);
}

// Parses "&&" groups joined by "||". The whole expression of a let, an
// assignment, a group, or a block.
export function parseExpression(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Parsed> {
  return parseChain(tokens, index, scope, end, factor, "or", parseAnd);
}
