import { err, ok } from "./result.ts";
import type { Result } from "./result.ts";
import type { TuffError } from "./errors.ts";
import { groupName, missingOperator } from "./errors.ts";
import { rootScope } from "./scope.ts";
import type { Operand } from "./scope.ts";
import { openerFor, tokenize, tokenText } from "./tokenize.ts";
import type { Token } from "./tokenize.ts";
import { parseFactor } from "./parse/factor.ts";
import { parseSequence } from "./parse/sequence.ts";

// The deepest allowed nesting of parentheses and braces. The parser recurses
// once per level, so this bound keeps it inside the call stack.
const MAX_NESTING = 1000;

// Rejects source whose parentheses and braces nest deeper than MAX_NESTING.
function checkNesting(tokens: Token[]): Result<true, TuffError> {
  let depth = 0;
  for (const token of tokens) {
    if (token.kind === "open") {
      depth++;
      if (depth > MAX_NESTING) {
        return err({
          what: "Nesting too deep",
          where: token.pos,
          why: `Groups nest more than ${MAX_NESTING} levels deep`,
          fix: "Reduce the nesting of parentheses and braces",
        });
      }
    } else if (token.kind === "close") {
      depth = Math.max(0, depth - 1);
    }
  }
  return ok(true);
}

// A program's final value as a number: true is 1 and false is 0.
function asNumber(value: Operand): number {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return value;
}

export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  // Grammar:
  //   sequence   = { statement } expression
  //   statement  = "let" [ "mut" ] name "=" value ";"
  //              | name "=" value ";"
  //              | "*" name "=" expression ";"
  //   value      = expression | "&" name | "&" "mut" name
  //   expression = and { "||" and }
  //   and        = sum { "&&" sum }
  //   sum        = [sign] term { ("+" | "-") term }
  //   term       = factor { "*" factor }
  //   factor     = number | "true" | "false" | name | "*" name | "(" expression ")" | "{" sequence "}"
  // Precedence, tightest first: "*", then "+" and "-", then "&&", then "||".
  // Operands of "&&" and "||" must be booleans; the right side is skipped when the
  // left side decides the result. A boolean is a value on its own, but arithmetic
  // needs numbers; a final boolean is returned as 1 or 0. Parentheses group an
  // expression. Braces group a block, whose lets are visible only inside it. Only
  // a `let mut` variable may be assigned, and "&mut" needs one. A reference may not
  // outlive the block that declares its target. Parentheses and braces nest freely,
  // but each opener must close with its own kind.
  const tokenized = tokenize(tuffSource);
  if (!tokenized.ok) {
    return tokenized;
  }
  const tokens = tokenized.value;
  const end = tuffSource.length;
  if (tokens.length === 0) {
    return ok(0);
  }
  const nesting = checkNesting(tokens);
  if (!nesting.ok) {
    return nesting;
  }

  const sequence = parseSequence(tokens, 0, rootScope(), end, parseFactor);
  if (!sequence.ok) {
    return sequence;
  }
  const stop = tokens[sequence.value.next];
  if (stop === undefined) {
    return ok(asNumber(sequence.value.value));
  }
  if (stop.kind === "close") {
    const opener = openerFor(stop.symbol);
    return err({
      what: `Unmatched ${groupName(stop.symbol)}`,
      where: stop.pos,
      why: `This "${stop.symbol}" has no matching "${opener}"`,
      fix: `Add a "${opener}" before its expression, or delete this "${stop.symbol}"`,
    });
  }
  return err(missingOperator(stop.pos, tokenText(stop)));
}
