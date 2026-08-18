import { EvalErrorCode, err } from "./errors.ts";
import type { Token } from "./tokens.ts";
import type { Env } from "./env.ts";
import {
  parseExpression,
  type ParseBlockFn,
  type ParseResult,
} from "./expressions.ts";

/**
 * Parses `expr ;` starting at `pos`, stores the result under `name` in `env`
 * with the given mutability, and returns `next` just past the `;`.
 */
export function parseBindingValue(
  tokens: Token[],
  pos: number,
  env: Env,
  name: string,
  mutable: boolean,
  parseBlock: ParseBlockFn,
): ParseResult {
  // "&[mut] ident" creates a reference binding instead of a value binding.
  const refTok = tokens[pos];
  if (refTok && refTok.type === "ref") {
    let refCursor = pos + 1;
    const maybeMut = tokens[refCursor];
    if (
      maybeMut &&
      maybeMut.type === "keyword" &&
      maybeMut.keyword === "mut"
    ) {
      refCursor++;
    }
    const refTarget = tokens[refCursor];
    if (refTarget && refTarget.type === "ident") {
      const target = env.get(refTarget.name);
      if (target === undefined) {
        return err(
          EvalErrorCode.UnknownVariable,
          "",
          `Variable "${refTarget.name}" is not defined. Declare it with "let ${refTarget.name} = ..." before taking a reference.`,
          refCursor,
        );
      }
      const semi = tokens[refCursor + 1];
      if (!semi || semi.type !== "semicolon") {
        return err(
          EvalErrorCode.ExpectedSemicolon,
          "",
          `";" was expected after the reference "&${refTarget.name}".`,
          refCursor + 1,
        );
      }
      env.set(name, {
        value: target.value,
        mutable,
        refTo: refTarget.name,
      });
      return { ok: true, value: target.value, next: refCursor + 2 };
    }
  }
  const value = parseExpression(tokens, pos, env, parseBlock);
  if (!value.ok) return value;
  const semi = tokens[value.next];
  if (!semi || semi.type !== "semicolon") {
    return err(
      EvalErrorCode.ExpectedSemicolon,
      "",
      `";" was expected after the value of "${name}".`,
      value.next,
    );
  }
  env.set(name, { value: value.value, mutable });
  return { ok: true, value: value.value, next: value.next + 1 };
}

/**
 * Parses an `ident = expr ;` reassignment statement. `pos` points at the
 * identifier. Returns `next` just past the terminating `;`.
 */
export function parseAssignment(
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
      "An identifier was expected before '='.",
      pos,
    );
  }
  const assign = tokens[pos + 1];
  if (!assign || assign.type !== "assign") {
    return err(
      EvalErrorCode.ExpectedAssign,
      "",
      `"=" was expected after the variable name "${ident.name}".`,
      pos + 1,
    );
  }
  const existing = env.get(ident.name);
  if (existing === undefined) {
    return err(
      EvalErrorCode.AssignmentToUnknown,
      "",
      `Variable "${ident.name}" is not defined. Declare it with "let ${ident.name} = ..." first.`,
      pos,
    );
  }
  if (!existing.mutable) {
    return err(
      EvalErrorCode.AssignmentToImmutable,
      "",
      `Variable "${ident.name}" is immutable. Declare it with "let mut ${ident.name} = ..." to reassign.`,
      pos,
    );
  }
  return parseBindingValue(tokens, pos + 2, env, ident.name, true, parseBlock);
}

/**
 * Parses a `*ident = expr ;` dereference-assignment statement. `pos` points
 * at the `*`. The referenced variable must be mutable. Returns `next` just
 * past the terminating `;`.
 */
export function parseDerefAssignment(
  tokens: Token[],
  pos: number,
  env: Env,
  parseBlock: ParseBlockFn,
): ParseResult {
  const refIdent = tokens[pos + 1];
  if (!refIdent || refIdent.type !== "ident") {
    return err(
      EvalErrorCode.ExpectedReferenceTarget,
      "",
      `A variable name was expected after "*". Write "*<variable> = ..." to assign through a reference.`,
      pos + 1,
    );
  }
  const refBinding = env.get(refIdent.name);
  if (refBinding === undefined) {
    return err(
      EvalErrorCode.UnknownVariable,
      "",
      `Variable "${refIdent.name}" is not defined. Declare it with "let ${refIdent.name} = ...".`,
      pos + 1,
    );
  }
  if (refBinding.refTo === undefined) {
    return err(
      EvalErrorCode.DerefOfNonReference,
      "",
      `Variable "${refIdent.name}" is not a reference. Create one with "let ${refIdent.name} = &<variable>".`,
      pos,
    );
  }
  const target = env.get(refBinding.refTo);
  if (target === undefined) {
    return err(
      EvalErrorCode.UnknownVariable,
      "",
      `Variable "${refBinding.refTo}" is not defined. It was referenced by "${refIdent.name}".`,
      pos,
    );
  }
  if (!target.mutable) {
    return err(
      EvalErrorCode.AssignmentToImmutableThroughReference,
      "",
      `Variable "${refBinding.refTo}" is immutable. Declare it with "let mut ${refBinding.refTo} = ..." to assign through a reference.`,
      pos,
    );
  }
  const value = parseExpression(tokens, pos + 3, env, parseBlock);
  if (!value.ok) return value;
  const semi = tokens[value.next];
  if (!semi || semi.type !== "semicolon") {
    return err(
      EvalErrorCode.ExpectedSemicolon,
      "",
      `";" was expected after the value of "*${refIdent.name}".`,
      value.next,
    );
  }
  target.value = value.value;
  refBinding.value = value.value;
  return { ok: true, value: value.value, next: value.next + 1 };
}
