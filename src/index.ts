import type { Failure, Result, TuffError } from "./errors";
import {
  blockEndsWithStatement,
  Bracket,
  booleanOperand,
  booleanSign,
  closerFor,
  expectedClose,
  expectedEquals,
  expectedMismatch,
  expectedNumber,
  expectedOperator,
  expectedSemicolon,
  expectedVariableName,
  letNotAllowed,
  notMutable,
  reservedName,
  undefinedName,
  unexpectedSemicolon,
} from "./errors";

import {
  isCloser,
  Operator,
  readDigits,
  readName,
  skipSpaces,
  toBracket,
  toOperator,
  isLetter,
} from "./scanner";

enum EntryKind {
  Operator = "operator",
  Group = "group",
  Binding = "binding",
}

enum Step {
  Continue = "continue",
  End = "end",
}

// A value is an integer or a boolean. A boolean has no arithmetic meaning.
type Value = number | boolean;

// Names with a fixed meaning. They cannot be variable names.
const RESERVED_NAMES = new Set(["let", "mut", "true", "false"]);

interface OperatorEntry {
  kind: EntryKind.Operator;
  operator: Operator;
  where: number;
}

// An open bracket, remembering its kind, the sign written before it, and its offset.
interface GroupEntry {
  kind: EntryKind.Group;
  bracket: Bracket;
  sign: number;
  where: number;
}

// A `let` or assignment whose value is still being evaluated; ends at ";".
interface BindingEntry {
  kind: EntryKind.Binding;
  name: string;
  mutable: boolean;
  assign: boolean;
}

type StackEntry = OperatorEntry | GroupEntry | BindingEntry;

interface Cell {
  value: Value;
  mutable: boolean;
}

type Scope = Map<string, Cell>;

interface ParserState {
  source: string;
  pos: number;
  values: Value[];
  ops: StackEntry[];
  scopes: Scope[];
  depth: number; // number of open brackets
  expectOperand: boolean;
  atStatementStart: boolean;
  afterLet: boolean; // the last top-level statement was a `let` or an assignment
  lastStatementEnded: boolean; // the most recent item was a statement, not an expression
}

function precedence(op: Operator): number {
  return op === Operator.Multiply ? 2 : 1;
}

function apply(left: number, op: Operator, right: number): number {
  if (op === Operator.Add) return left + right;
  if (op === Operator.Subtract) return left - right;
  return left * right;
}

// Applies a sign to a value. Only numbers take a sign, so a negative sign on a
// boolean is a failure.
function applySign(
  value: Value,
  sign: number,
  where: number,
): Failure<TuffError> | Value {
  if (sign === 1) return value;
  if (typeof value === "boolean") return booleanSign(where);
  return sign * value;
}

// Pops the newest operator and applies it to the two newest values. Returns a
// failure when an operand is a boolean. The grammar guarantees both operands exist.
function applyTop(
  values: Value[],
  ops: StackEntry[],
): Failure<TuffError> | undefined {
  const entry = ops.pop();
  if (entry?.kind !== EntryKind.Operator) return undefined;
  const right = values.pop() ?? 0;
  const left = values.pop() ?? 0;
  if (typeof left === "boolean" || typeof right === "boolean") {
    return booleanOperand(entry.where, entry.operator);
  }
  values.push(apply(left, entry.operator, right));
  return undefined;
}

// Applies every pending operator at the top of the stack.
function reduceOperators(
  values: Value[],
  ops: StackEntry[],
): Failure<TuffError> | undefined {
  for (
    let top = ops[ops.length - 1];
    top?.kind === EntryKind.Operator;
    top = ops[ops.length - 1]
  ) {
    const failure = applyTop(values, ops);
    if (failure !== undefined) return failure;
  }
  return undefined;
}

// The newest open bracket on the stack, or undefined when none is open.
function innermostGroup(ops: StackEntry[]): GroupEntry | undefined {
  for (let idx = ops.length - 1; idx >= 0; idx--) {
    const entry = ops[idx];
    if (entry?.kind === EntryKind.Group) return entry;
  }
  return undefined;
}

// The newest open bracket or `let` on the stack, or undefined when there is none.
function innermostNonOperator(ops: StackEntry[]): StackEntry | undefined {
  for (let idx = ops.length - 1; idx >= 0; idx--) {
    const entry = ops[idx];
    if (entry !== undefined && entry.kind !== EntryKind.Operator) return entry;
  }
  return undefined;
}

// The innermost scope's cell for `name`, or undefined.
function lookupCell(scopes: Scope[], name: string): Cell | undefined {
  for (let idx = scopes.length - 1; idx >= 0; idx--) {
    const cell = scopes[idx]?.get(name);
    if (cell !== undefined) return cell;
  }
  return undefined;
}

// Closes the innermost group: applies its operators, then scales the result by
// the sign written before its opening bracket.
function closeGroup(
  values: Value[],
  ops: StackEntry[],
): Failure<TuffError> | undefined {
  const reduced = reduceOperators(values, ops);
  if (reduced !== undefined) return reduced;
  const group = ops.pop();
  if (group?.kind !== EntryKind.Group) return undefined;
  const signed = applySign(values.pop() ?? 0, group.sign, group.where);
  if (typeof signed === "object") return signed;
  values.push(signed);
  return undefined;
}

// Completes a `let` or assignment: its value is the newest value. A `let` binds
// in the current scope; an assignment updates the nearest declaration.
function closeBinding(
  state: ParserState,
  binding: BindingEntry,
): Failure<TuffError> | undefined {
  const reduced = reduceOperators(state.values, state.ops);
  if (reduced !== undefined) return reduced;
  state.ops.pop();
  const value = state.values.pop() ?? 0;
  if (binding.assign) {
    const cell = lookupCell(state.scopes, binding.name);
    if (cell !== undefined) cell.value = value;
  } else {
    const cell = { value, mutable: binding.mutable };
    state.scopes[state.scopes.length - 1]?.set(binding.name, cell);
  }
  state.lastStatementEnded = true;
  if (state.depth === 0) state.afterLet = true;
  return undefined;
}

function pushOperand(state: ParserState, value: Value, end: number): Step {
  state.lastStatementEnded = false;
  state.values.push(value);
  state.pos = end;
  state.expectOperand = false;
  state.atStatementStart = false;
  return Step.Continue;
}

function openBracket(state: ParserState, bracket: Bracket, sign: number): Step {
  state.ops.push({ kind: EntryKind.Group, bracket, sign, where: state.pos });
  if (bracket === Bracket.Brace) state.scopes.push(new Map());
  state.depth++;
  state.pos++;
  state.atStatementStart = bracket === Bracket.Brace;
  return Step.Continue;
}

// Reads `let [mut] NAME =` and leaves the parser ready for the value.
function startLet(
  state: ParserState,
  letEnd: number,
): Failure<TuffError> | Step {
  let nameStart = skipSpaces(state.source, letEnd);
  let nameEnd = readName(state.source, nameStart);
  let mutable = false;
  if (state.source.slice(nameStart, nameEnd) === "mut") {
    mutable = true;
    nameStart = skipSpaces(state.source, nameEnd);
    nameEnd = readName(state.source, nameStart);
  }
  if (nameEnd === nameStart)
    return expectedVariableName(state.source, nameStart);
  const name = state.source.slice(nameStart, nameEnd);
  if (RESERVED_NAMES.has(name)) return reservedName(nameStart, name);
  const equals = skipSpaces(state.source, nameEnd);
  if (state.source.charAt(equals) !== "=") {
    return expectedEquals(state.source, equals, name);
  }
  state.ops.push({ kind: EntryKind.Binding, name, mutable, assign: false });
  state.pos = skipSpaces(state.source, equals + 1);
  state.expectOperand = true;
  state.atStatementStart = false;
  return Step.Continue;
}

// Reads `NAME =` at a statement start and leaves the parser ready for the value.
function startAssign(
  state: ParserState,
  name: string,
  nameStart: number,
  equals: number,
): Failure<TuffError> | Step {
  const cell = lookupCell(state.scopes, name);
  if (cell === undefined) return undefinedName(nameStart, name);
  if (!cell.mutable) return notMutable(nameStart, name);
  state.ops.push({
    kind: EntryKind.Binding,
    name,
    mutable: false,
    assign: true,
  });
  state.pos = skipSpaces(state.source, equals + 1);
  state.expectOperand = true;
  state.atStatementStart = false;
  return Step.Continue;
}

function operandName(
  state: ParserState,
  sign: number,
  signed: boolean,
): Failure<TuffError> | Step {
  const end = readName(state.source, state.pos);
  const name = state.source.slice(state.pos, end);
  if (name === "let") {
    if (state.atStatementStart && !signed) return startLet(state, end);
    return letNotAllowed(state.pos);
  }
  if (name === "true" || name === "false") {
    const literal = applySign(name === "true", sign, state.pos);
    if (typeof literal === "object") return literal;
    return pushOperand(state, literal, end);
  }
  const equals = skipSpaces(state.source, end);
  if (
    state.atStatementStart &&
    !signed &&
    state.source.charAt(equals) === "="
  ) {
    return startAssign(state, name, state.pos, equals);
  }
  const cell = lookupCell(state.scopes, name);
  if (cell === undefined) return undefinedName(state.pos, name);
  const value = applySign(cell.value, sign, state.pos);
  if (typeof value === "object") return value;
  return pushOperand(state, value, end);
}

function operandNumber(
  state: ParserState,
  sign: number,
): Failure<TuffError> | Step {
  const end = readDigits(state.source, state.pos);
  if (end === state.pos) return expectedNumber(state.source, state.pos);
  return pushOperand(
    state,
    sign * parseInt(state.source.slice(state.pos, end), 10),
    end,
  );
}

// Reads an operand: a sign, then a number, a variable, a boolean, or an opening bracket.
function stepOperand(state: ParserState): Failure<TuffError> | Step {
  state.pos = skipSpaces(state.source, state.pos);
  if (
    state.atStatementStart &&
    state.depth === 0 &&
    state.afterLet &&
    state.pos === state.source.length
  ) {
    return Step.End;
  }
  if (
    state.atStatementStart &&
    state.depth > 0 &&
    state.lastStatementEnded &&
    state.source.charAt(state.pos) === "}"
  ) {
    return blockEndsWithStatement(state.pos);
  }
  if (state.atStatementStart && state.source.charAt(state.pos) === ";") {
    return unexpectedSemicolon(state.pos);
  }
  let sign = 1;
  let ch = state.source.charAt(state.pos);
  const signed = ch === "+" || ch === "-";
  if (signed) {
    if (ch === "-") sign = -1;
    state.pos++;
    ch = state.source.charAt(state.pos);
  }
  const bracket = toBracket(ch);
  if (bracket !== undefined) return openBracket(state, bracket, sign);
  if (isLetter(ch)) return operandName(state, sign, signed);
  return operandNumber(state, sign);
}

function pushOperator(
  state: ParserState,
  op: Operator,
): Failure<TuffError> | undefined {
  // Left-associative: apply pending operators that bind at least as tightly.
  for (
    let top = state.ops[state.ops.length - 1];
    top?.kind === EntryKind.Operator &&
    precedence(top.operator) >= precedence(op);
    top = state.ops[state.ops.length - 1]
  ) {
    const failure = applyTop(state.values, state.ops);
    if (failure !== undefined) return failure;
  }
  state.ops.push({ kind: EntryKind.Operator, operator: op, where: state.pos });
  state.pos++;
  state.expectOperand = true;
  state.atStatementStart = false;
  return undefined;
}

function endOfInput(state: ParserState): Failure<TuffError> | Step {
  const group = innermostGroup(state.ops);
  if (state.depth > 0 && group !== undefined) {
    return expectedClose(state.source, state.pos, group.bracket);
  }
  if (innermostNonOperator(state.ops)?.kind === EntryKind.Binding) {
    return expectedSemicolon(state.source, state.pos);
  }
  return Step.End;
}

function endStatement(state: ParserState): Failure<TuffError> | Step {
  const open = innermostNonOperator(state.ops);
  if (open?.kind === EntryKind.Binding) {
    const failure = closeBinding(state, open);
    if (failure !== undefined) return failure;
    state.pos++;
    state.expectOperand = true;
    state.atStatementStart = true;
    return Step.Continue;
  }
  if (open?.kind === EntryKind.Group) {
    return expectedClose(state.source, state.pos, open.bracket);
  }
  return unexpectedSemicolon(state.pos);
}

function closeBracket(
  state: ParserState,
  ch: string,
): Failure<TuffError> | Step {
  if (innermostNonOperator(state.ops)?.kind === EntryKind.Binding) {
    return expectedSemicolon(state.source, state.pos);
  }
  const group = innermostGroup(state.ops);
  if (group === undefined)
    return expectedOperator(state.source, state.pos, true);
  if (ch !== closerFor(group.bracket)) {
    return expectedMismatch(state.source, state.pos, group.bracket);
  }
  const failure = closeGroup(state.values, state.ops);
  if (failure !== undefined) return failure;
  if (group.bracket === Bracket.Brace) state.scopes.pop();
  state.depth--;
  state.pos++;
  state.atStatementStart = false;
  return Step.Continue;
}

// Reads an operator, a closing bracket, or the end of the input.
function stepOperator(state: ParserState): Failure<TuffError> | Step {
  state.pos = skipSpaces(state.source, state.pos);
  if (state.pos === state.source.length) return endOfInput(state);
  const ch = state.source.charAt(state.pos);
  if (ch === ";") return endStatement(state);
  if (state.depth > 0 && isCloser(ch)) return closeBracket(state, ch);
  const op = toOperator(ch);
  if (op === undefined) {
    if (innermostNonOperator(state.ops)?.kind === EntryKind.Binding) {
      return expectedSemicolon(state.source, state.pos);
    }
    return expectedOperator(state.source, state.pos, state.depth > 0);
  }
  return pushOperator(state, op) ?? Step.Continue;
}

/**
 * Evaluates a Tuff program: `let NAME = value;` statements followed by an
 * expression. Integers, booleans (`true` and `false`), variables, `+`, `-`, `*`,
 * signs, parentheses, and braces are supported. A boolean cannot be used in
 * arithmetic. The final value of a boolean program is 1 or 0. Braces open a block
 * scope, and the value of a block is its last expression. Uses explicit stacks, so
 * nesting depth is not limited by the JavaScript call stack. Offsets in errors
 * refer to the unmodified source.
 *
 * @param tuffSource - the program to evaluate.
 * @returns the value on success, or a TuffError describing the first syntax error.
 */
export function interpretTuff(tuffSource: string): Result<number, TuffError> {
  const state: ParserState = {
    source: tuffSource,
    pos: 0,
    values: [],
    ops: [],
    scopes: [new Map()],
    depth: 0,
    expectOperand: true,
    atStatementStart: true,
    afterLet: false,
    lastStatementEnded: false,
  };
  for (;;) {
    const outcome = state.expectOperand
      ? stepOperand(state)
      : stepOperator(state);
    if (outcome === Step.End) break;
    if (outcome !== Step.Continue) return outcome;
  }
  const failure = reduceOperators(state.values, state.ops);
  if (failure !== undefined) return failure;
  const result = state.values.pop() ?? 0;
  return {
    ok: true,
    value: typeof result === "boolean" ? Number(result) : result,
  };
}
