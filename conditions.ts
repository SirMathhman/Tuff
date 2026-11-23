import { ok } from "./errors.ts";
import { invalidAt, type Parse, type ExprRule } from "./parse-errors.ts";

/**
 * Parses the parenthesized condition that follows an if keyword.
 * @param tokens - The token list being parsed.
 * @param pos - The index of the if keyword.
 * @param depth - The number of groups enclosing this position.
 * @param expr - The expression rule used for the condition.
 * @returns The condition and the index just after its closing parenthesis, or an error.
 */
export function parseCondition(tokens: string[], pos: number, depth: number, expr: ExprRule): Parse {
  if (tokens[pos + 1] !== "(") {
    return invalidAt(tokens, pos + 1, "'(' after 'if'", "Write the condition in parentheses after 'if'.");
  }

  const condition = expr(tokens, pos + 2, depth + 1);

  if (!condition.ok) {
    return condition;
  }

  if (tokens[condition.value.next] !== ")") {
    return invalidAt(tokens, condition.value.next, "')' after the condition", "Close the condition with ')'.");
  }

  return ok({ value: condition.value.value, next: condition.value.next + 1 });
}
