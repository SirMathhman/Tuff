import { EvalErrorCode, err } from "./errors.ts";
import type { Token } from "./tokens.ts";
import {
  resolvePlace,
  writePlace,
  type Env,
  type Place,
  type Value,
} from "./env.ts";
import { parseExpression } from "./expressions.ts";
import { parseIndexStep } from "./factors.ts";
import type {
  ParseBlockFn,
  ParseExpressionFn,
  ParseResult,
} from "./parse.ts";

export interface PlaceParsed {
  ok: true;
  place: Place;
  value: Value;
  next: number;
}

export type PlaceResult = PlaceParsed | ReturnType<typeof err>;

/**
 * Parses a reference target: a bare identifier or a parenthesized
 * identifier, optionally followed by `[ index ]` chains (e.g. `x`,
 * `(array[0])`). Returns the `Place` the reference points at and the value
 * currently stored there. `pos` points at the first token of the target.
 */
export function parsePlace(
  tokens: Token[],
  pos: number,
  env: Env,
  parseBlock: ParseBlockFn,
  parseExpression: ParseExpressionFn,
): PlaceResult {
  const first = tokens[pos];
  let variable: string;
  let cursor: number;
  if (first && first.type === "ident") {
    variable = first.name;
    cursor = pos + 1;
  } else if (first && first.type === "paren" && first.paren === "(") {
    const inner = tokens[pos + 1];
    if (!inner || inner.type !== "ident") {
      return err(
        EvalErrorCode.ReferenceTargetMustBeVariable,
        "",
        `A reference must point at a variable or array element (e.g. "&x" or "&(array[0])"), not an arbitrary expression.`,
        pos + 1,
      );
    }
    variable = inner.name;
    cursor = pos + 2;
  } else {
    return err(
      EvalErrorCode.ReferenceTargetMustBeVariable,
      "",
      `A reference must point at a variable or array element (e.g. "&x" or "&(array[0])").`,
      pos,
    );
  }
  const indices: number[] = [];
  for (;;) {
    const open = tokens[cursor];
    if (!open || open.type !== "paren" || open.paren !== "[") break;
    const step = parseIndexStep(tokens, cursor, env, parseBlock, parseExpression);
    if (!step.ok) return step;
    indices.push(step.index);
    cursor = step.next;
  }
  if (first.type === "paren") {
    const close = tokens[cursor];
    if (!close || close.type !== "paren" || close.paren !== ")") {
      return err(
        EvalErrorCode.ExpectedCloseParen,
        "",
        `A closing ")" was expected after the reference target. Add a matching ")".`,
        cursor,
      );
    }
    cursor++;
  }
  const place: Place = { variable, indices };
  const value = resolvePlace(env, place);
  if (value === undefined) {
    return err(
      EvalErrorCode.UnknownVariable,
      "",
      `Variable "${variable}" is not defined. Declare it with "let ${variable} = ..." before taking a reference.`,
      pos,
    );
  }
  return { ok: true, place, value, next: cursor };
}

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
  // "&[mut] <place>" creates a reference binding instead of a value binding.
  const refTok = tokens[pos];
  if (refTok && refTok.type === "ref") {
    let refCursor = pos + 1;
    const maybeMut = tokens[refCursor];
    if (maybeMut && maybeMut.type === "keyword" && maybeMut.keyword === "mut") {
      refCursor++;
    }
    const place = parsePlace(
      tokens,
      refCursor,
      env,
      parseBlock,
      parseExpression,
    );
    if (place.ok) {
      const semi = tokens[place.next];
      if (!semi || semi.type !== "semicolon") {
        return err(
          EvalErrorCode.ExpectedSemicolon,
          "",
          `";" was expected after the reference "&${place.place.variable}".`,
          place.next,
        );
      }
      env.set(name, {
        value: place.value,
        mutable,
        place: place.place,
      });
      return { ok: true, value: place.value, next: place.next + 1 };
    }
    return place;
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
  if (refBinding.place === undefined) {
    return err(
      EvalErrorCode.DerefOfNonReference,
      "",
      `Variable "${refIdent.name}" is not a reference. Create one with "let ${refIdent.name} = &<variable>".`,
      pos,
    );
  }
  const place = refBinding.place;
  const root = env.get(place.variable);
  if (root === undefined) {
    return err(
      EvalErrorCode.UnknownVariable,
      "",
      `Variable "${place.variable}" is not defined. It was referenced by "${refIdent.name}".`,
      pos,
    );
  }
  if (!root.mutable) {
    return err(
      EvalErrorCode.AssignmentToImmutableThroughReference,
      "",
      `Variable "${place.variable}" is immutable. Declare it with "let mut ${place.variable} = ..." to assign through a reference.`,
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
  if (!writePlace(env, place, value.value)) {
    return err(
      EvalErrorCode.IndexOutOfBounds,
      "",
      `The place referenced by "${refIdent.name}" is no longer valid. Check the variable and array indices it points to.`,
      pos,
    );
  }
  refBinding.value = value.value;
  return { ok: true, value: value.value, next: value.next + 1 };
}
