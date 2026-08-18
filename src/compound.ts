import { EvalErrorCode, err } from "./errors.ts";
import type { Token } from "./tokens.ts";
import type { Env } from "./env.ts";
import { parseExpression } from "./expressions.ts";
import { requireMutableBinding } from "./assignments.ts";
import type { ParseBlockFn, ParseResult } from "./parse.ts";

/**
 * Parses an `ident += expr ;` compound-assignment statement. `pos` points
 * at the identifier. The variable must be mutable and hold a number.
 * Returns `next` just past the terminating `;`.
 */
export function parseCompoundAssignment(
  tokens: Token[],
  pos: number,
  env: Env,
  parseBlock: ParseBlockFn,
): ParseResult {
  const ident = tokens[pos];
  if (!ident || ident.type !== "ident") {
    return err(
      EvalErrorCode.ExpectedIdentifier,
      "",
      "An identifier was expected before '+='.",
      pos,
    );
  }
  const existing = requireMutableBinding(env, ident.name, pos);
  if (!existing.ok) return existing;
  const binding = existing.binding;
  if (binding.value.kind !== "num") {
    return err(
      EvalErrorCode.CompoundAssignNeedsNumber,
      "",
      `"+=" can only add to a number, but "${ident.name}" is a ${binding.value.kind}.`,
      pos,
    );
  }
  const value = parseExpression(tokens, pos + 2, env, parseBlock);
  if (!value.ok) return value;
  if (value.value.kind !== "num") {
    return err(
      EvalErrorCode.CompoundAssignNeedsNumber,
      "",
      `"+=" can only add a number, but the right-hand side is a ${value.value.kind}.`,
      pos + 2,
    );
  }
  const semi = tokens[value.next];
  if (!semi || semi.type !== "semicolon") {
    return err(
      EvalErrorCode.ExpectedSemicolon,
      "",
      `";" was expected after the value of "${ident.name} += ...".`,
      value.next,
    );
  }
  binding.value = { kind: "num", num: binding.value.num + value.value.num };
  return { ok: true, value: binding.value, next: value.next + 1 };
}
