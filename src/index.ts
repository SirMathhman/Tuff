import type { Failure, Result, TuffError } from "./errors";
import {
  Bracket,
  closerFor,
  expectedClose,
  expectedEquals,
  expectedMismatch,
  expectedNumber,
  expectedOperator,
  expectedSemicolon,
  expectedVariableName,
  blockEndsWithStatement,
  letNotAllowed,
  notMutable,
  reservedName,
  undefinedName,
  unexpectedSemicolon,
} from "./errors";

enum Operator {
  Add = "+",
  Subtract = "-",
  Multiply = "*",
}

enum EntryKind {
  Operator = "operator",
  Group = "group",
  Binding = "binding",
}

enum Step {
  Continue = "continue",
  End = "end",
}

interface OperatorEntry {
  kind: EntryKind.Operator;
  operator: Operator;
}

// An open bracket, remembering its kind and the sign written directly before it.
interface GroupEntry {
  kind: EntryKind.Group;
  bracket: Bracket;
  sign: number;
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
  value: number;
  mutable: boolean;
}

type Scope = Map<string, Cell>;

interface ParserState {
  source: string;
  pos: number;
  values: number[];
  ops: StackEntry[];
  scopes: Scope[];
  depth: number; // number of open brackets
  expectOperand: boolean;
  atStatementStart: boolean;
  afterLet: boolean; // the last top-level statement was a `let` or an assignment
  lastStatementEnded: boolean; // the most recent item was a statement, not an expression
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isSpace(ch: string): boolean {
  return ch.length === 1 && ch.trim() === "";
}

function toOperator(ch: string): Operator | null {
  if (ch === "+") return Operator.Add;
  if (ch === "-") return Operator.Subtract;
  if (ch === "*") return Operator.Multiply;
  return null;
}

function toBracket(ch: string): Bracket | null {
  if (ch === "(") return Bracket.Paren;
  if (ch === "{") return Bracket.Brace;
  return null;
}

function isCloser(ch: string): boolean {
  return ch === ")" || ch === "}";
}

function skipSpaces(source: string, pos: number): number {
  let idx = pos;
  while (isSpace(source.charAt(idx))) idx++;
  return idx;
}

function readDigits(source: string, start: number): number {
  let idx = start;
  while (isDigit(source.charAt(idx))) idx++;
  return idx;
}

function readName(source: string, start: number): number {
  let idx = start;
  while (isLetter(source.charAt(idx))) idx++;
  return idx;
}

function precedence(op: Operator): number {
  return op === Operator.Multiply ? 2 : 1;
}

function apply(left: number, op: Operator, right: number): number {
  if (op === Operator.Add) return left + right;
  if (op === Operator.Subtract) return left - right;
  return left * right;
}

// Pops the newest operator and applies it to the two newest values. The grammar
// guarantees both operands are present.
function applyTop(values: number[], ops: StackEntry[]): void {
  const entry = ops.pop();
  if (entry?.kind !== EntryKind.Operator) return;
  const right = values.pop() ?? 0;
  const left = values.pop() ?? 0;
  values.push(apply(left, entry.operator, right));
}

// Applies every pending operator at the top of the stack.
function reduceOperators(values: number[], ops: StackEntry[]): void {
  for (
    let top = ops[ops.length - 1];
    top?.kind === EntryKind.Operator;
    top = ops[ops.length - 1]
  ) {
    applyTop(values, ops);
  }
}

// The newest open bracket on the stack, or null when none is open.
function innermostGroup(ops: StackEntry[]): GroupEntry | null {
  for (let idx = ops.length - 1; idx >= 0; idx--) {
    const entry = ops[idx];
    if (entry?.kind === EntryKind.Group) return entry;
  }
  return null;
}

// The newest open bracket or `let` on the stack, or null when there is none.
function innermostNonOperator(ops: StackEntry[]): StackEntry | null {
  for (let idx = ops.length - 1; idx >= 0; idx--) {
    const entry = ops[idx];
    if (entry !== undefined && entry.kind !== EntryKind.Operator) return entry;
  }
  return null;
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
function closeGroup(values: number[], ops: StackEntry[]): void {
  reduceOperators(values, ops);
  const group = ops.pop();
  if (group?.kind !== EntryKind.Group) return;
  values.push(group.sign * (values.pop() ?? 0));
}

// Completes a `let` or assignment: its value is the newest value. A `let` binds
// in the current scope; an assignment updates the nearest declaration.
function closeBinding(state: ParserState, binding: BindingEntry): void {
  reduceOperators(state.values, state.ops);
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
}

function pushOperand(state: ParserState, value: number, end: number): Step {
  state.lastStatementEnded = false;
  state.values.push(value);
  state.pos = end;
  state.expectOperand = false;
  state.atStatementStart = false;
  return Step.Continue;
}

function openBracket(state: ParserState, bracket: Bracket, sign: number): Step {
  state.ops.push({ kind: EntryKind.Group, bracket, sign });
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
  if (name === "let" || name === "mut") return reservedName(nameStart);
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
  return pushOperand(state, sign * cell.value, end);
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

// Reads an operand: a sign, then a number, a variable, or an opening bracket.
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
  if (bracket !== null) return openBracket(state, bracket, sign);
  if (isLetter(ch)) return operandName(state, sign, signed);
  return operandNumber(state, sign);
}

function pushOperator(state: ParserState, op: Operator): void {
  // Left-associative: apply pending operators that bind at least as tightly.
  for (
    let top = state.ops[state.ops.length - 1];
    top?.kind === EntryKind.Operator &&
    precedence(top.operator) >= precedence(op);
    top = state.ops[state.ops.length - 1]
  ) {
    applyTop(state.values, state.ops);
  }
  state.ops.push({ kind: EntryKind.Operator, operator: op });
  state.pos++;
  state.expectOperand = true;
  state.atStatementStart = false;
}

function endOfInput(state: ParserState): Failure<TuffError> | Step {
  const group = innermostGroup(state.ops);
  if (state.depth > 0 && group !== null) {
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
    closeBinding(state, open);
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
  if (group === null) return expectedOperator(state.source, state.pos, true);
  if (ch !== closerFor(group.bracket)) {
    return expectedMismatch(state.source, state.pos, group.bracket);
  }
  closeGroup(state.values, state.ops);
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
  if (op === null) {
    if (innermostNonOperator(state.ops)?.kind === EntryKind.Binding) {
      return expectedSemicolon(state.source, state.pos);
    }
    return expectedOperator(state.source, state.pos, state.depth > 0);
  }
  pushOperator(state, op);
  return Step.Continue;
}

/**
 * Evaluates a Tuff program: `let NAME = value;` statements followed by an
 * expression. Integers, variables, `+`, `-`, `*`, signs, parentheses, and braces
 * are supported. Braces open a block scope, and the value of a block is its last
 * expression. Uses explicit stacks, so nesting depth is not limited by the
 * JavaScript call stack. Offsets in errors refer to the unmodified source.
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
  reduceOperators(state.values, state.ops);
  return { ok: true, value: state.values.pop() ?? 0 };
}
