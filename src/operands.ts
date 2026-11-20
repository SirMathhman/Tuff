import type { Failure, TuffError } from "./errors";
import {
  Bracket,
  blockEndsWithStatement,
  elseNotAllowed,
  expectedClose,
  expectedEquals,
  expectedIfParen,
  expectedNumber,
  expectedSemicolon,
  expectedVariableName,
  letNotAllowed,
  mutableBorrow,
  mutableReference,
  notMutable,
  notReference,
  ownerBorrowed,
  readOnlyReference,
  referenceNotLet,
  referenceOverlap,
  referenceUse,
  reservedName,
  undefinedName,
  unexpectedSemicolon,
} from "./errors";
import { applySign } from "./operations";
import {
  isLetter,
  readDigits,
  readName,
  skipSpaces,
  toBracket,
} from "./scanner";
import type {
  BindingEntry,
  Cell,
  GroupEntry,
  ParserState,
  Scope,
  StackEntry,
  Value,
} from "./types";
import { EntryKind, IfPhase, Step } from "./types";
import { borrowedBy, completeBranch, isLenient, lookupCell } from "./helpers";

// Names with a fixed meaning. They cannot be variable names.
const RESERVED_NAMES = new Set(["let", "mut", "true", "false", "if", "else"]);

function pushOperand(
  state: ParserState,
  value: Value,
  end: number,
): Failure<TuffError> | Step {
  const { values, flags } = state;
  flags.lastStatementEnded = false;
  values.push(value);
  state.pos = end;
  state.expectOperand = false;
  flags.atStatementStart = false;
  return completeBranch(state) ?? Step.Continue;
}

function openBracket(state: ParserState, bracket: Bracket, sign: number): Step {
  const { ops, scopes, flags } = state;
  const top = ops[ops.length - 1];
  const ifCondition =
    top?.kind === EntryKind.If && top.phase === IfPhase.Condition;
  ops.push({
    kind: EntryKind.Group,
    bracket,
    sign,
    where: state.pos,
    ifCondition,
  });
  if (bracket === Bracket.Brace) scopes.push(new Map());
  state.depth++;
  state.pos++;
  flags.atStatementStart = bracket === Bracket.Brace;
  return Step.Continue;
}

// Reads `if` and waits for its parenthesized condition.
function startIf(state: ParserState, sign: number, end: number): Step {
  const { ops, flags } = state;
  ops.push({
    kind: EntryKind.If,
    phase: IfPhase.Condition,
    sign,
    where: state.pos,
    condition: false,
    skipping: false,
    value: undefined,
  });
  state.pos = end;
  flags.atStatementStart = false;
  return Step.Continue;
}

// Reads `let [mut] NAME =` and leaves the parser ready for the value.
function startLet(
  state: ParserState,
  letEnd: number,
): Failure<TuffError> | Step {
  const { source, ops, flags } = state;
  let nameStart = skipSpaces(source, letEnd);
  let nameEnd = readName(source, nameStart);
  let mutable = false;
  if (source.slice(nameStart, nameEnd) === "mut") {
    mutable = true;
    nameStart = skipSpaces(source, nameEnd);
    nameEnd = readName(source, nameStart);
  }
  if (nameEnd === nameStart) return expectedVariableName(source, nameStart);
  const name = source.slice(nameStart, nameEnd);
  if (RESERVED_NAMES.has(name)) return reservedName(nameStart, name);
  const equals = skipSpaces(source, nameEnd);
  if (source.charAt(equals) !== "=") {
    return expectedEquals(source, equals, name);
  }
  ops.push({
    kind: EntryKind.Binding,
    name,
    mutable,
    assign: false,
    where: nameStart,
  });
  state.pos = skipSpaces(source, equals + 1);
  state.expectOperand = true;
  flags.atStatementStart = false;
  return Step.Continue;
}

// Reads `NAME =` at a statement start and leaves the parser ready for the value.
function startAssign(
  state: ParserState,
  name: string,
  nameStart: number,
  equals: number,
): Failure<TuffError> | Step {
  const { source, ops, scopes, flags } = state;
  const cell = lookupCell(scopes, name);
  if (cell === undefined) return undefinedName(nameStart, name);
  if (!cell.mutable) return notMutable(nameStart, name);
  ops.push({
    kind: EntryKind.Binding,
    name,
    mutable: false,
    assign: true,
    where: nameStart,
  });
  state.pos = skipSpaces(source, equals + 1);
  state.expectOperand = true;
  flags.atStatementStart = false;
  return Step.Continue;
}

function operandName(
  state: ParserState,
  sign: number,
  signed: boolean,
): Failure<TuffError> | Step {
  const { source, scopes, flags } = state;
  const end = readName(source, state.pos);
  const name = source.slice(state.pos, end);
  if (name === "let") {
    if (flags.atStatementStart && !signed) return startLet(state, end);
    return letNotAllowed(state.pos);
  }
  if (name === "if") return startIf(state, sign, end);
  if (name === "else") return elseNotAllowed(state.pos);
  if (name === "true" || name === "false") {
    const literal = applySign(
      name === "true",
      sign,
      state.pos,
      isLenient(state),
    );
    if (typeof literal === "object") return literal;
    return pushOperand(state, literal, end);
  }
  const equals = skipSpaces(source, end);
  if (flags.atStatementStart && !signed && source.charAt(equals) === "=") {
    return startAssign(state, name, state.pos, equals);
  }
  const cell = lookupCell(scopes, name);
  if (cell === undefined) {
    return undefinedName(state.pos, name);
  }
  if (cell.target !== undefined) return referenceUse(state.pos, name);
  if (borrowedBy(scopes, cell, true)) {
    return ownerBorrowed(state.pos, name, false);
  }
  const value = applySign(cell.value, sign, state.pos, isLenient(state));
  if (typeof value === "object") return value;
  return pushOperand(state, value, end);
}

// Whether a new reference to `cell` conflicts with one already in scope: a `&mut`
// conflicts with any reference, and a `&` conflicts with a `&mut`.
function conflictsWithReference(
  scopes: Scope[],
  cell: Cell,
  exclusive: boolean,
): boolean {
  return borrowedBy(scopes, cell, !exclusive);
}

/**
 * The `let` a reference would bind, and the block or branch that yields it, if any.
 */
interface LetOwner {
  /** The let that binds the reference. */
  binding: BindingEntry;
  /** The braced block or if-branch whose final value is the reference, if any. */
  carrier?: GroupEntry;
}

// Finds the `let` that a reference here would bind. The reference is the whole value of
// a `let`, or the final value of a braced block or if-branch that is the whole value of a `let`.
function letOwner(ops: StackEntry[]): LetOwner | undefined {
  const top = ops[ops.length - 1];
  if (top?.kind === EntryKind.Binding) {
    return top.assign ? undefined : { binding: top };
  }
  if (
    top?.kind !== EntryKind.Group ||
    top.bracket !== Bracket.Brace ||
    top.ifCondition
  ) {
    return undefined;
  }
  const below = ops[ops.length - 2];
  if (below?.kind === EntryKind.Binding) {
    return below.assign ? undefined : { binding: below, carrier: top };
  }
  const owner = ops[ops.length - 3];
  if (
    below?.kind === EntryKind.If &&
    (below.phase === IfPhase.Then || below.phase === IfPhase.Else) &&
    owner?.kind === EntryKind.Binding &&
    !owner.assign
  ) {
    return { binding: owner, carrier: top };
  }
  return undefined;
}

// Reads `&NAME` or `&mut NAME`. It is recorded on the `let` it binds, or on the block or
// if-branch that yields it, and a placeholder goes on the value stack.
function operandRef(
  state: ParserState,
  signed: boolean,
): Failure<TuffError> | Step {
  const { source, ops, scopes } = state;
  const owner = letOwner(ops);
  if (signed || owner === undefined) return referenceNotLet(state.pos);
  const { binding, carrier } = owner;
  if (binding.mutable) return mutableReference(binding.where, binding.name);
  let nameStart = skipSpaces(source, state.pos + 1);
  let end = readName(source, nameStart);
  const exclusive = source.slice(nameStart, end) === "mut";
  if (exclusive) {
    nameStart = skipSpaces(source, end);
    end = readName(source, nameStart);
  }
  if (end === nameStart) return expectedVariableName(source, nameStart);
  const name = source.slice(nameStart, end);
  const cell = lookupCell(scopes, name);
  if (cell === undefined) return undefinedName(nameStart, name);
  if (cell.target !== undefined) return referenceUse(nameStart, name);
  if (exclusive && !cell.mutable) return mutableBorrow(nameStart, name);
  if (conflictsWithReference(scopes, cell, exclusive)) {
    return referenceOverlap(nameStart, name);
  }
  const innermost = scopes[scopes.length - 1];
  if (carrier !== undefined && innermost?.get(name) === cell) {
    return referenceNotLet(state.pos);
  }
  const after = skipSpaces(source, end);
  if (carrier === undefined) {
    if (source.charAt(after) !== ";") return expectedSemicolon(source, after);
    binding.target = cell;
    binding.exclusive = exclusive;
  } else {
    if (source.charAt(after) !== "}") {
      return expectedClose(source, after, Bracket.Brace);
    }
    carrier.ref = { target: cell, exclusive };
  }
  return pushOperand(state, 0, end);
}

// Reads `*NAME =` at a statement start. The assignment writes the variable the
// reference points to, and only a `&mut` reference may do so.
function startDerefAssign(
  state: ParserState,
  name: string,
  nameStart: number,
  equals: number,
  reference: Cell,
  target: Cell,
): Failure<TuffError> | Step {
  const { source, ops, flags } = state;
  if (reference.exclusive !== true) return readOnlyReference(nameStart, name);
  ops.push({
    kind: EntryKind.Binding,
    name,
    mutable: false,
    assign: true,
    where: nameStart,
    target,
  });
  state.pos = skipSpaces(source, equals + 1);
  state.expectOperand = true;
  flags.atStatementStart = false;
  return Step.Continue;
}

// Reads `*NAME`, which yields the value of the variable the reference points to.
function operandDeref(
  state: ParserState,
  sign: number,
  signed: boolean,
): Failure<TuffError> | Step {
  const { source, scopes, flags } = state;
  const nameStart = skipSpaces(source, state.pos + 1);
  const end = readName(source, nameStart);
  if (end === nameStart) return expectedVariableName(source, nameStart);
  const name = source.slice(nameStart, end);
  const cell = lookupCell(scopes, name);
  if (cell === undefined) return undefinedName(nameStart, name);
  const target = cell.target;
  if (target === undefined) return notReference(nameStart, name);
  const equals = skipSpaces(source, end);
  if (flags.atStatementStart && !signed && source.charAt(equals) === "=") {
    return startDerefAssign(state, name, nameStart, equals, cell, target);
  }
  const value = applySign(target.value, sign, state.pos, isLenient(state));
  if (typeof value === "object") return value;
  return pushOperand(state, value, end);
}

function operandNumber(
  state: ParserState,
  sign: number,
): Failure<TuffError> | Step {
  const { source } = state;
  const end = readDigits(source, state.pos);
  if (end === state.pos) return expectedNumber(source, state.pos);
  return pushOperand(
    state,
    sign * parseInt(source.slice(state.pos, end), 10),
    end,
  );
}

/**
 * Reads an operand: a sign, then a number, a variable, a boolean, an if, or an opening bracket.
 *
 * @param state - the parser state.
 * @returns the next step, or a failure.
 */
export function stepOperand(state: ParserState): Failure<TuffError> | Step {
  const { source, ops, flags } = state;
  state.pos = skipSpaces(source, state.pos);
  if (
    flags.atStatementStart &&
    state.depth === 0 &&
    flags.afterLet &&
    state.pos === source.length
  ) {
    return Step.End;
  }
  if (
    flags.atStatementStart &&
    state.depth > 0 &&
    flags.lastStatementEnded &&
    source.charAt(state.pos) === "}"
  ) {
    return blockEndsWithStatement(state.pos);
  }
  if (flags.atStatementStart && source.charAt(state.pos) === ";") {
    return unexpectedSemicolon(state.pos);
  }
  const top = ops[ops.length - 1];
  if (
    top?.kind === EntryKind.If &&
    top.phase === IfPhase.Condition &&
    source.charAt(state.pos) !== "("
  ) {
    return expectedIfParen(source, state.pos);
  }
  let sign = 1;
  let ch = source.charAt(state.pos);
  const signed = ch === "+" || ch === "-";
  if (signed) {
    if (ch === "-") sign = -1;
    state.pos++;
    ch = source.charAt(state.pos);
  }
  const bracket = toBracket(ch);
  if (bracket !== undefined) return openBracket(state, bracket, sign);
  if (ch === "&") return operandRef(state, signed);
  if (ch === "*") return operandDeref(state, sign, signed);
  if (isLetter(ch)) return operandName(state, sign, signed);
  return operandNumber(state, sign);
}
