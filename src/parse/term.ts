import { booleanAsNumber } from "../errors.ts";
import { err, ok } from "../result.ts";
import type { Operand, Scope } from "../scope.ts";
import { textAt } from "../tokenize.ts";
import type { Token } from "../tokenize.ts";
import type { ParseResult, Parsed, Parser } from "./types.ts";

// A number from an operand, or an error if the operand is a boolean. `where` and
// `text` locate the operand in the message.
export function numberFrom(
  value: Operand,
  where: number,
  text: string,
): ParseResult<number> {
  if (typeof value === "boolean") {
    return err(booleanAsNumber(where, text));
  }
  return ok(value);
}

// Parses factors joined by "*", with an optional sign before the first. `sign` is
// 0 when there is no sign. A term that is one factor with no sign or "*" keeps
// its value, so a boolean passes through. Any arithmetic needs numbers.
export function parseTerm(
  tokens: Token[],
  index: number,
  sign: 1 | -1 | 0,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Parsed> {
  const first = factor(tokens, index, scope, end);
  if (!first.ok) {
    return first;
  }
  const firstPos = tokens[index]?.pos ?? end;
  let value: Operand = first.value.value;
  let next = first.value.next;
  let current = first.value.scope;
  let token = tokens[next];
  let operated = sign !== 0;
  while (token?.kind === "operator" && token.symbol === "*") {
    const nextFactor = factor(tokens, next + 1, current, end);
    if (!nextFactor.ok) {
      return nextFactor;
    }
    const left = numberFrom(value, firstPos, textAt(tokens, index));
    if (!left.ok) {
      return left;
    }
    const right = numberFrom(
      nextFactor.value.value,
      tokens[next + 1]?.pos ?? end,
      textAt(tokens, next + 1),
    );
    if (!right.ok) {
      return right;
    }
    value = left.value * right.value;
    operated = true;
    next = nextFactor.value.next;
    current = nextFactor.value.scope;
    token = tokens[next];
  }
  if (!operated) {
    return ok({ value, next, scope: current });
  }
  const numeric = numberFrom(value, firstPos, textAt(tokens, index));
  if (!numeric.ok) {
    return numeric;
  }
  return ok({
    value: sign === 0 ? numeric.value : sign * numeric.value,
    next,
    scope: current,
  });
}
