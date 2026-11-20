import type { Failure, TuffError } from "../errors";
import {
  arrayMixed,
  arrayNotBound,
  arrayNotUsable,
  expectedNumber,
  expectedOperator,
  expectedText,
  indexNotInteger,
  indexOutOfRange,
  notMutable,
  ownerBorrowed,
  typeMismatch,
} from "../errors";
import { applySign, reduceOperators } from "../operations";
import { skipSpaces } from "../scanner";
import type {
  ArrayData,
  ArrayEntry,
  BindingEntry,
  Cell,
  IndexEntry,
  ParserState,
  Slot,
  Value,
} from "../types";
import { EntryKind, Step } from "../types";
import {
  borrowedBy,
  completeBranch,
  innermostNonOperator,
  isLenient,
} from "./helpers";

/**
 * Starts an array literal, which must be the value of a let or an element of one.
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

// The shape of an element: its type, or the shape of a nested array.
function slotShape(slot: Slot): string {
  return typeof slot === "object" ? slot.shape : typeof slot;
}

// Adds an element, requiring it to have the same shape as the others.
function addElement(
  array: ArrayEntry,
  slot: Slot,
  where: number,
): Failure<TuffError> | undefined {
  const { items } = array;
  const first = items[0];
  if (first !== undefined && slotShape(first) !== slotShape(slot)) {
    return arrayMixed(where);
  }
  items.push(slot);
  return undefined;
}

// Takes the element that has just finished: a nested array, or the value on the stack.
function takeSlot(array: ArrayEntry, values: Value[]): Slot {
  const popped = values.pop() ?? 0;
  const nested = array.pending;
  array.pending = undefined;
  return nested ?? popped;
}

/**
 * Reports a finished nested array followed by anything other than a comma or `]`.
 *
 * @param state - the parser state.
 * @returns a failure when the nested array is followed by something else, or undefined.
 */
export function checkNestedEnd(
  state: ParserState,
): Failure<TuffError> | undefined {
  const open = innermostNonOperator(state.ops);
  if (open?.kind !== EntryKind.Array || open.pending === undefined) {
    return undefined;
  }
  const { source, pos } = state;
  const ch = source.charAt(pos);
  if (ch === "," || ch === "]") return undefined;
  return expectedText(state.source, state.pos, "]");
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
  const failure = addElement(array, takeSlot(array, values), state.pos);
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

// A finished array's data, with the shape of its elements.
function dataOf(array: ArrayEntry): ArrayData {
  const { items } = array;
  const first = items[0] ?? 0;
  return { items, shape: `[${slotShape(first)}]` };
}

function closeArray(
  state: ParserState,
  array: ArrayEntry,
): Failure<TuffError> | Step {
  const { source, ops, values, flags } = state;
  if (state.expectOperand) return expectedNumber(source, state.pos);
  const reduced = reduceOperators(values, ops);
  if (reduced !== undefined) return reduced;
  const failure = addElement(array, takeSlot(array, values), state.pos);
  if (failure !== undefined) return failure;
  ops.pop();
  const outer = innermostNonOperator(ops);
  if (outer?.kind === EntryKind.Array) {
    // A nested array: the enclosing array takes it as its next element.
    outer.pending = dataOf(array);
  } else if (outer?.kind === EntryKind.Binding && !outer.assign) {
    outer.items = array.items;
  } else {
    return arrayNotBound(array.where);
  }
  values.push(0);
  state.pos++;
  state.expectOperand = false;
  flags.atStatementStart = false;
  return Step.Continue;
}

/**
 * Starts an index into an array, after its opening bracket. At a statement start an
 * index on a variable may be the target of an element assignment.
 *
 * @param state - the parser state.
 * @param cell - the array's variable.
 * @param name - the array's name.
 * @param sign - the sign written before the name.
 * @param nameStart - the offset of the name.
 * @param bracket - the offset of the opening bracket.
 * @param statement - whether the index starts a statement.
 * @returns the next step.
 */
export function openIndex(
  state: ParserState,
  cell: Cell,
  name: string,
  sign: number,
  nameStart: number,
  bracket: number,
  statement: boolean,
): Step {
  const { ops, flags } = state;
  const entry: IndexEntry = {
    kind: EntryKind.Index,
    where: nameStart,
    sign,
    cell,
    name,
    statement,
    items: cell.items ?? [],
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
  const { name, items } = index;
  if (state.expectOperand) return expectedNumber(source, state.pos);
  const reduced = reduceOperators(values, ops);
  if (reduced !== undefined) return reduced;
  const position = values.pop() ?? 0;
  ops.pop();
  if (typeof position !== "number") return indexNotInteger(state.pos);
  if (position < 0 || position >= items.length) {
    return indexOutOfRange(state.pos, position, items.length);
  }
  const element = items[position] ?? 0;
  const next = skipSpaces(source, state.pos + 1);
  if (typeof element === "object") {
    // A nested array: another index must follow it.
    if (source.charAt(next) !== "[") return arrayNotUsable(index.where, name);
    ops.push({
      kind: EntryKind.Index,
      where: index.where,
      sign: index.sign,
      name,
      statement: false,
      items: element.items,
    });
    state.pos = next + 1;
    state.expectOperand = true;
    flags.atStatementStart = false;
    return Step.Continue;
  }
  if (source.charAt(next) === "[") return arrayNotUsable(index.where, name);
  const { cell } = index;
  const assigning =
    cell !== undefined &&
    index.statement &&
    source.charAt(next) === "=" &&
    source.charAt(next + 1) !== "=";
  if (assigning) {
    if (!cell.mutable) return notMutable(index.where, name);
    ops.push({
      kind: EntryKind.Binding,
      name,
      mutable: false,
      assign: true,
      where: index.where,
      target: cell,
      index: position,
    });
    state.pos = skipSpaces(source, next + 1);
    state.expectOperand = true;
    flags.atStatementStart = false;
    flags.lastStatementEnded = false;
    return Step.Continue;
  }
  const signed = applySign(element, index.sign, index.where);
  if (typeof signed === "object") return signed;
  values.push(signed);
  state.pos++;
  state.expectOperand = false;
  flags.atStatementStart = false;
  return completeBranch(state) ?? Step.Continue;
}

/**
 * Stores a value into an element of a let mut array, once the assignment is complete.
 *
 * @param state - the parser state.
 * @param binding - the element assignment, whose target is the array's variable.
 * @param value - the value being assigned.
 * @returns a failure, or undefined when the element was stored.
 */
export function assignElement(
  state: ParserState,
  binding: BindingEntry,
  value: Value,
): Failure<TuffError> | undefined {
  const { target, where, name, index } = binding;
  if (target === undefined || index === undefined) return undefined;
  if (borrowedBy(state.scopes, target, false)) {
    return ownerBorrowed(where, name, true);
  }
  const items = target.items ?? [];
  const current = items[index];
  if (current !== undefined && slotShape(current) !== typeof value) {
    return typeMismatch(where, name, slotShape(current), typeof value);
  }
  if (!isLenient(state)) items[index] = value;
  return undefined;
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
