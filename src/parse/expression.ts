import { ok } from "../result.ts";
import type { Scope } from "../scope.ts";
import { signAt, textAt } from "../tokenize.ts";
import type { Token } from "../tokenize.ts";
import { numberFrom, parseTerm } from "./term.ts";
import type { ParseResult, Parsed, Parser } from "./types.ts";

// Parses an optional leading sign, then terms joined by "+" or "-". Stops
// before the first token that is not "+" or "-"; the caller decides whether
// that token is valid there. A single term keeps a boolean value; a sum needs
// numbers.
export function parseExpression(
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
