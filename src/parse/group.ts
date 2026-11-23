import { groupName, missingOperator } from "../errors.ts";
import { err, ok } from "../result.ts";
import { childScope, closeScope, findEscape } from "../scope.ts";
import type { Scope } from "../scope.ts";
import { closerFor, openerFor, tokenText } from "../tokenize.ts";
import type { Token } from "../tokenize.ts";
import { parseExpression } from "./expression.ts";
import { parseSequence } from "./sequence.ts";
import type { ParseResult, Parsed, Parser } from "./types.ts";

// Parses "(" expression ")" or "{" sequence "}". `index` points at the opener.
// A brace group is a block: its lets stay inside it, but its assignments to
// outer variables persist after it closes.
export function parseGroup(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
  factor: Parser,
): ParseResult<Parsed> {
  const open = tokens[index];
  const openSymbol = open?.kind === "open" ? open.symbol : "(";
  const inner =
    openSymbol === "{"
      ? parseSequence(tokens, index + 1, childScope(scope), end, factor)
      : parseExpression(tokens, index + 1, scope, end, factor);
  if (!inner.ok) {
    return inner;
  }
  const next = inner.value.next;
  const token = tokens[next];
  if (token === undefined) {
    const closer = closerFor(openSymbol);
    return err({
      what: `Unmatched ${groupName(openSymbol)}`,
      where: open?.pos ?? end,
      why: `The "${openSymbol}" at this position has no matching "${closer}"`,
      fix: `Add a "${closer}" after its expression, or delete this "${openSymbol}"`,
    });
  }
  if (token.kind !== "close") {
    return err(missingOperator(token.pos, tokenText(token)));
  }
  if (token.symbol !== closerFor(openSymbol)) {
    return err({
      what: "Mismatched bracket",
      where: token.pos,
      why: `This "${token.symbol}" does not match the "${openSymbol}" at position ${open?.pos ?? end}`,
      fix: `Change this to "${closerFor(openSymbol)}", or change the "${openSymbol}" to "${openerFor(token.symbol)}"`,
    });
  }
  if (openSymbol === "{") {
    const escaped = findEscape(scope, inner.value.scope);
    if (escaped !== undefined) {
      return err({
        what: "Reference escapes block",
        where: token.pos,
        why: `"${escaped}" would refer to a variable that ends with this block`,
        fix: "Point the outer variable at a variable that lives as long as it does",
      });
    }
  }
  const closed =
    openSymbol === "{"
      ? closeScope(scope, inner.value.scope)
      : inner.value.scope;
  return ok({ value: inner.value.value, next: next + 1, scope: closed });
}
