import {
  missingNumber,
  missingNumberAtEnd,
  referenceAsNumber,
  undefinedVariable,
} from "../errors.ts";
import { err, ok } from "../result.ts";
import type { Scope } from "../scope.ts";
import { isStarAt, tokenText } from "../tokenize.ts";
import type { NameToken, Token } from "../tokenize.ts";
import { parseDeref } from "./deref.ts";
import { parseGroup } from "./group.ts";
import type { ParseResult, Parsed } from "./types.ts";

// A factor is a number, a boolean, a variable, a dereference, or a grouped
// expression. Signs are not allowed directly before a factor; a sign inside a
// group belongs to that expression.
export function parseFactor(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
): ParseResult<Parsed> {
  const token = tokens[index];
  if (token?.kind === "open") {
    return parseGroup(tokens, index, scope, end, parseFactor);
  }
  if (token?.kind === "name") {
    return parseVariable(token, index, scope);
  }
  if (token?.kind === "boolean") {
    return ok({ value: token.value, next: index + 1, scope });
  }
  const nameToken = tokens[index + 1];
  if (isStarAt(tokens, index) && nameToken?.kind === "name") {
    return parseDeref(nameToken, index, scope);
  }
  return parseNumber(tokens, index, scope, end);
}

function parseNumber(
  tokens: Token[],
  index: number,
  scope: Scope,
  end: number,
): ParseResult<Parsed> {
  const token = tokens[index];
  if (token === undefined) {
    return err(missingNumberAtEnd(end));
  }
  if (token.kind !== "number") {
    return err(missingNumber(token.pos, tokenText(token)));
  }
  return ok({ value: token.value, next: index + 1, scope });
}

// A variable used as a number. Every declared variable has a slot, so the slot
// is always present.
function parseVariable(
  token: NameToken,
  index: number,
  scope: Scope,
): ParseResult<Parsed> {
  const variable = scope.names.get(token.name);
  if (variable === undefined) {
    return err(undefinedVariable(token.name, token.pos));
  }
  const cell = scope.cells.get(variable.id);
  if (cell === undefined || typeof cell === "object") {
    return err(referenceAsNumber(token.name, token.pos));
  }
  return ok({ value: cell, next: index + 1, scope });
}
