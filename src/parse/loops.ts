import type { Failure, TuffError } from "../errors";
import {
  Bracket,
  expectedClose,
  expectedText,
  nonBooleanCondition,
} from "../errors";
import { skipSpaces } from "../scanner";
import type { LoopEntry, ParserState } from "../types";
import { EntryKind, GroupPart, Step } from "../types";
import { innermostNonOperator, isLenient } from "./helpers";

/**
 * Finds the bracket closing the one at `open`.
 *
 * @param source - the program being parsed.
 * @param open - the offset of the opening bracket.
 * @returns the offset of the closing bracket, or undefined at the end of input.
 */
export function matchingClose(
  source: string,
  open: number,
): number | undefined {
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    const ch = source.charAt(index);
    if (ch === "(" || ch === "{") {
      depth++;
    } else if (ch === ")" || ch === "}") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

/**
 * Tells which part of a loop a bracket at `pos` opens, if any.
 *
 * @param loop - the loop being parsed.
 * @param pos - the offset of the bracket.
 * @returns the part, or undefined when the bracket is elsewhere.
 */
export function loopPartAt(
  loop: LoopEntry,
  pos: number,
): GroupPart | undefined {
  if (pos === loop.condStart) return GroupPart.LoopCondition;
  if (pos === loop.bodyStart) return GroupPart.LoopBody;
  return undefined;
}

/**
 * Reads `while (condition) { body }` at a statement start. The condition and body are
 * parsed again on each pass, so the loop is a jump back to the condition.
 *
 * @param state - the parser state.
 * @param keywordEnd - the offset just past the `while` keyword.
 * @returns the next step, or a failure.
 */
export function startWhile(
  state: ParserState,
  keywordEnd: number,
): Failure<TuffError> | Step {
  const { source, ops, flags } = state;
  const open = skipSpaces(source, keywordEnd);
  if (source.charAt(open) !== "(") return expectedText(source, open, "(");
  const close = matchingClose(source, open);
  if (close === undefined) {
    return expectedClose(source, source.length, Bracket.Paren);
  }
  const body = skipSpaces(source, close + 1);
  if (source.charAt(body) !== "{") return expectedText(source, body, "{");
  const bodyClose = matchingClose(source, body);
  if (bodyClose === undefined) {
    return expectedClose(source, source.length, Bracket.Brace);
  }
  ops.push({
    kind: EntryKind.Loop,
    where: state.pos,
    condStart: open,
    bodyStart: body,
    end: bodyClose + 1,
    once: false,
    counted: false,
  });
  state.pos = open;
  state.expectOperand = true;
  flags.atStatementStart = false;
  return Step.Continue;
}

/**
 * Handles a closed loop condition: runs the body when the condition is true, and
 * parses the body once without running it when the condition is false or the loop
 * is itself unchosen.
 *
 * @param state - the parser state.
 * @param closePos - the offset of the condition's closing parenthesis.
 * @returns the next step, or a failure.
 */
export function closeLoopCondition(
  state: ParserState,
  closePos: number,
): Failure<TuffError> | Step {
  const { ops, values, flags } = state;
  const value = values.pop() ?? false;
  if (typeof value !== "boolean") {
    return nonBooleanCondition(closePos, "while");
  }
  const loop = innermostNonOperator(ops);
  if (loop?.kind !== EntryKind.Loop) return Step.Continue;
  const lenient = isLenient(state);
  loop.once = lenient || value === false;
  loop.counted = loop.once && !lenient;
  if (loop.counted) state.skipDepth++;
  state.pos = loop.bodyStart;
  state.expectOperand = true;
  flags.atStatementStart = true;
  flags.lastStatementEnded = false;
  return Step.Continue;
}

/**
 * Handles a closed loop body: discards its value, then jumps back to the condition,
 * or ends the loop when the body was parsed only once.
 *
 * @param state - the parser state.
 * @returns the next step.
 */
export function closeLoopBody(state: ParserState): Step {
  const { ops, values, flags } = state;
  values.pop();
  const loop = innermostNonOperator(ops);
  if (loop?.kind !== EntryKind.Loop) return Step.Continue;
  if (loop.once) {
    if (loop.counted) state.skipDepth--;
    ops.pop();
    state.pos = loop.end;
    state.expectOperand = true;
    flags.atStatementStart = true;
    flags.lastStatementEnded = true;
    flags.lastAssign = false;
    if (state.depth === 0) flags.afterLet = true;
    return Step.Continue;
  }
  state.pos = loop.condStart;
  state.expectOperand = true;
  flags.atStatementStart = false;
  flags.lastStatementEnded = false;
  return Step.Continue;
}
