import type { Failure, TuffError } from "../errors";
import {
  Bracket,
  caseAfterWildcard,
  expectedCase,
  expectedClose,
  expectedSemicolon,
  expectedText,
  noMatch,
  unexpectedSemicolon,
} from "../errors";
import { applySign, reduceOperators } from "../operations";
import { matchingClose, readDigits, readName, skipSpaces } from "../scanner";
import type { MatchEntry, ParserState, StackEntry, Value } from "../types";
import { EntryKind, GroupPart, MatchChoice, Step } from "../types";
import { completeBranch, innermostNonOperator, isLenient } from "./helpers";

/**
 * Tells which part of a match a bracket at `pos` opens, if any.
 *
 * @param match - the match being parsed.
 * @param pos - the offset of the bracket.
 * @returns the part, or undefined when the bracket is elsewhere.
 */
export function matchPartAt(
  match: MatchEntry,
  pos: number,
): GroupPart | undefined {
  if (pos === match.parenStart) return GroupPart.MatchScrutinee;
  if (pos === match.bodyStart) return GroupPart.MatchBody;
  return undefined;
}

/**
 * Reads `match (value) { cases }` where a value is expected. The value is read first,
 * then each case in turn until one is chosen.
 *
 * @param state - the parser state.
 * @param keywordEnd - the offset just past the `match` keyword.
 * @param sign - the sign written before the match.
 * @returns the next step, or a failure.
 */
export function startMatch(
  state: ParserState,
  keywordEnd: number,
  sign: number,
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
  ops.push({
    kind: EntryKind.Match,
    where: state.pos,
    sign,
    parenStart: open,
    bodyStart: body,
    scrutinee: undefined,
    armOpen: false,
    skipping: false,
    choice: MatchChoice.None,
    result: undefined,
  });
  state.pos = open;
  state.expectOperand = true;
  flags.atStatementStart = false;
  return Step.Continue;
}

// The match whose cases are open, when the innermost bracket is its case block.
function openMatch(ops: StackEntry[]): MatchEntry | undefined {
  const body = innermostNonOperator(ops);
  const match = ops[ops.length - 2];
  if (body?.kind !== EntryKind.Group || body.part !== GroupPart.MatchBody) {
    return undefined;
  }
  return match?.kind === EntryKind.Match ? match : undefined;
}

/**
 * Whether a `case` keyword can start here: only directly inside a match's case block.
 *
 * @param ops - the operator stack.
 * @returns true when a case is expected.
 */
export function inMatchBody(ops: StackEntry[]): boolean {
  return openMatch(ops) !== undefined;
}

/**
 * Reads `case LITERAL => value` inside a match. The case is chosen when its literal
 * equals the scrutinee and no earlier case was chosen; otherwise its value is parsed
 * without effect.
 *
 * @param state - the parser state.
 * @param keywordEnd - the offset just past the `case` keyword.
 * @returns the next step, or a failure.
 */
export function startArm(
  state: ParserState,
  keywordEnd: number,
): Failure<TuffError> | Step {
  const { source, ops, flags } = state;
  const match = openMatch(ops);
  if (match === undefined) return unexpectedSemicolon(state.pos);
  const literalStart = skipSpaces(source, keywordEnd);
  if (match.choice === MatchChoice.Wildcard)
    return caseAfterWildcard(literalStart);
  const wordEnd = readName(source, literalStart);
  const word = source.slice(literalStart, wordEnd);
  const digitsEnd = readDigits(source, literalStart);
  const wildcard = source.charAt(literalStart) === "_";
  let literal: Value | undefined;
  let end: number;
  if (wildcard) {
    end = literalStart + 1;
  } else if (word === "true" || word === "false") {
    literal = word === "true";
    end = wordEnd;
  } else if (digitsEnd > literalStart) {
    literal = parseInt(source.slice(literalStart, digitsEnd), 10);
    end = digitsEnd;
  } else {
    return expectedCase(source, literalStart);
  }
  const arrow = skipSpaces(source, end);
  if (source.slice(arrow, arrow + 2) !== "=>") {
    return expectedText(source, arrow, "=>");
  }
  const open = match.choice === MatchChoice.None;
  const taken = open && (wildcard || literal === match.scrutinee);
  match.armOpen = true;
  match.skipping = !taken;
  if (taken)
    match.choice = wildcard ? MatchChoice.Wildcard : MatchChoice.Literal;
  if (match.skipping) state.skipDepth++;
  state.pos = skipSpaces(source, arrow + 2);
  state.expectOperand = true;
  flags.atStatementStart = false;
  flags.lastStatementEnded = false;
  return Step.Continue;
}

/**
 * Ends a case's value at its `;`, keeping the value only when the case was chosen.
 *
 * @param state - the parser state.
 * @returns the next step, or a failure.
 */
export function finishArm(state: ParserState): Failure<TuffError> | Step {
  const { source, ops, values, flags } = state;
  const reduced = reduceOperators(values, ops);
  if (reduced !== undefined) return reduced;
  const match = openMatch(ops);
  if (match === undefined || !match.armOpen) {
    return expectedSemicolon(source, state.pos, "'case' arm");
  }
  const value = values.pop() ?? 0;
  match.armOpen = false;
  if (match.skipping) {
    state.skipDepth--;
    match.skipping = false;
  } else {
    match.result = value;
  }
  state.pos++;
  // After the last case only the closing brace can follow, which is an operator position.
  state.expectOperand = source.charAt(skipSpaces(source, state.pos)) !== "}";
  flags.atStatementStart = false;
  return Step.Continue;
}

/**
 * Handles a closed match scrutinee: records the value and moves to the case block.
 *
 * @param state - the parser state.
 * @returns the next step.
 */
export function closeMatchScrutinee(state: ParserState): Step {
  const { ops, values, flags } = state;
  const scrutinee = values.pop() ?? 0;
  const match = innermostNonOperator(ops);
  if (match?.kind === EntryKind.Match) {
    match.scrutinee = scrutinee;
    state.pos = match.bodyStart;
  }
  state.expectOperand = true;
  flags.atStatementStart = true;
  flags.lastStatementEnded = false;
  return Step.Continue;
}

/**
 * Ends a match at its closing brace: yields the chosen case's value, or reports that
 * no case matched. In an unchosen branch an unmatched value is not reported.
 *
 * @param state - the parser state.
 * @param closePos - the offset of the closing brace.
 * @returns the next step, or a failure.
 */
export function closeMatchBody(
  state: ParserState,
  closePos: number,
): Failure<TuffError> | Step {
  const { source, ops, scopes, values, flags } = state;
  const match = openMatch(ops);
  if (match === undefined)
    return expectedClose(source, closePos, Bracket.Brace);
  if (match.armOpen) {
    return expectedSemicolon(source, closePos, "'case' arm");
  }
  const chosen = match.choice !== MatchChoice.None;
  if (!chosen && !isLenient(state)) return noMatch(match.where);
  scopes.pop();
  ops.pop();
  ops.pop();
  state.depth--;
  state.pos = closePos + 1;
  flags.atStatementStart = false;
  const value = chosen ? (match.result ?? 0) : 0;
  const signed = applySign(value, match.sign, match.where);
  if (typeof signed === "object") return signed;
  values.push(signed);
  return completeBranch(state) ?? Step.Continue;
}
