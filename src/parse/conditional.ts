import { missingElse, numberAsCondition } from "../errors.ts";
import { err, ok } from "../result.ts";
import type { Scope } from "../scope.ts";
import { textAt } from "../tokenize.ts";
import type { Token } from "../tokenize.ts";
import { parseExpression } from "./expression.ts";
import type { ParseResult, Parsed, Parser } from "./types.ts";

// Parses "if" condition value "else" value. `index` points at the "if". The
// condition is one factor, normally a parenthesized group, and must be a boolean.
// Both branches are parsed, so an error in either is reported, but only the
// chosen branch's assignments are kept. This matches "&&" and "||". Each branch
// is an expression or a block, and it runs to the end of the expression.
export function parseConditional(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Parsed> {
  const condition = factor(tokens, index + 1, scope, end);
  if (!condition.ok) {
    return condition;
  }
  const conditionValue = condition.value.value;
  if (typeof conditionValue !== "boolean") {
    const after = tokens[condition.value.next];
    const followed =
      after?.kind === "comparison" ||
      after?.kind === "operator" ||
      after?.kind === "and" ||
      after?.kind === "or";
    return err(
      numberAsCondition(
        tokens[index + 1]?.pos ?? end,
        textAt(tokens, index + 1),
        followed,
      ),
    );
  }
  const branchScope = condition.value.scope;
  const thenBranch = parseExpression(
    tokens,
    condition.value.next,
    branchScope,
    end,
    factor,
  );
  if (!thenBranch.ok) {
    return thenBranch;
  }
  const elseToken = tokens[thenBranch.value.next];
  if (elseToken?.kind !== "else") {
    return err(missingElse(elseToken?.pos ?? end));
  }
  const elseBranch = parseExpression(
    tokens,
    thenBranch.value.next + 1,
    branchScope,
    end,
    factor,
  );
  if (!elseBranch.ok) {
    return elseBranch;
  }
  const taken = conditionValue ? thenBranch.value : elseBranch.value;
  return ok({
    value: taken.value,
    next: elseBranch.value.next,
    scope: taken.scope,
  });
}
