import type { Failure, TuffError } from "../errors";
import {
  arrayMixed,
  arrayNotBound,
  expectedNumber,
  expectedOperator,
  expectedText,
  indexNotInteger,
  indexOutOfRange,
} from "../errors";
import { applySign, reduceOperators } from "../operations";
import type { ArrayEntry, IndexEntry, ParserState, Value } from "../types";
import { EntryKind, Step } from "../types";
import { completeBranch, innermostNonOperator } from "./helpers";

/**
 * Starts an array literal, which must be the value of a let.
 *
 * @param state - the parser state.
 * @returns the next step.
 */
export function openArray(state: ParserState): Step {
  const { ops, flags } = state;
  ops.push({ kind: EntryKind.Array, where: state.pos, items: [] });
  state.pos++;
  state.expectOperand = true;
  flags.atStatementStart = false;
  return Step.Continue;
}

// Adds an element, requiring it to have the same type as the others.
function addElement(
  array: ArrayEntry,
  value: Value,
  where: number,
): Failure<TuffError> | undefined {
  const { items } = array;
  const first = items[0];
  if (first !== undefined && typeof first !== typeof value) {
    return arrayMixed(where);
  }
  items.push(value);
  return undefined;
}

/**
 * Handles a comma: ends the element before it.
 *
 * @param state - the parser state.
 * @returns the next step, or a failure.
 */
export function nextElement(state: ParserState): Failure<TuffError> | Step {
  const { source, ops, values, flags } = state;
  const array = innermostNonOperator(ops);
  if (array?.kind !== EntryKind.Array) {
    return expectedOperator(source, state.pos, true);
  }
  if (state.expectOperand) return expectedNumber(source, state.pos);
  const reduced = reduceOperators(values, ops);
  if (reduced !== undefined) return reduced;
  const failure = addElement(array, values.pop() ?? 0, state.pos);
  if (failure !== undefined) return failure;
  state.pos++;
  state.expectOperand = true;
  flags.atStatementStart = false;
  return Step.Continue;
}

/**
 * Handles a closing bracket that ends an array literal or an index.
 *
 * @param state - the parser state.
 * @returns the next step, or a failure.
 */
export function closeSquare(state: ParserState): Failure<TuffError> | Step {
  const { source, ops } = state;
  const open = innermostNonOperator(ops);
  if (open?.kind === EntryKind.Index) return closeIndex(state, open);
  if (open?.kind !== EntryKind.Array) {
    return expectedOperator(source, state.pos, true);
  }
  return closeArray(state, open);
}

function closeArray(
  state: ParserState,
  array: ArrayEntry,
): Failure<TuffError> | Step {
  const { source, ops, values, flags } = state;
  if (state.expectOperand) return expectedNumber(source, state.pos);
  const reduced = reduceOperators(values, ops);
  if (reduced !== undefined) return reduced;
  const failure = addElement(array, values.pop() ?? 0, state.pos);
  if (failure !== undefined) return failure;
  ops.pop();
  const binding = innermostNonOperator(ops);
  if (binding?.kind !== EntryKind.Binding || binding.assign) {
    return arrayNotBound(array.where);
  }
  binding.items = array.items;
  values.push(0);
  state.pos++;
  state.expectOperand = false;
  flags.atStatementStart = false;
  return Step.Continue;
}

/**
 * Starts an index into the array named by an operand, after its opening bracket.
 *
 * @param state - the parser state.
 * @param items - the elements of the array.
 * @param sign - the sign written before the name.
 * @param bracket - the offset of the opening bracket.
 * @returns the next step.
 */
export function openIndex(
  state: ParserState,
  items: Value[],
  sign: number,
  bracket: number,
): Step {
  const { ops, flags } = state;
  const entry: IndexEntry = {
    kind: EntryKind.Index,
    where: bracket,
    sign,
    items,
  };
  ops.push(entry);
  state.pos = bracket + 1;
  state.expectOperand = true;
  flags.atStatementStart = false;
  return Step.Continue;
}

function closeIndex(
  state: ParserState,
  index: IndexEntry,
): Failure<TuffError> | Step {
  const { source, ops, values, flags } = state;
  if (state.expectOperand) return expectedNumber(source, state.pos);
  const reduced = reduceOperators(values, ops);
  if (reduced !== undefined) return reduced;
  const position = values.pop() ?? 0;
  ops.pop();
  if (typeof position !== "number") return indexNotInteger(state.pos);
  const { items } = index;
  if (position < 0 || position >= items.length) {
    return indexOutOfRange(state.pos, position, items.length);
  }
  const element = items[position] ?? 0;
  const signed = applySign(element, index.sign, index.where);
  if (typeof signed === "object") return signed;
  values.push(signed);
  state.pos++;
  state.expectOperand = false;
  flags.atStatementStart = false;
  return completeBranch(state) ?? Step.Continue;
}

/**
 * Reports a missing `]` when the input ends inside an array literal or index.
 *
 * @param state - the parser state.
 * @returns a failure when a bracket is still open, or undefined.
 */
export function unclosedSquare(
  state: ParserState,
): Failure<TuffError> | undefined {
  const open = innermostNonOperator(state.ops);
  if (open?.kind === EntryKind.Array || open?.kind === EntryKind.Index) {
    return expectedText(state.source, state.pos, "]");
  }
  return undefined;
}
