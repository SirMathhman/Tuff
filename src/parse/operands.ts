import type { Failure, TuffError } from "../errors";
import {
  Bracket,
  blockEndsWithStatement,
  elseNotAllowed,
  expectedEquals,
  expectedIfParen,
  expectedNumber,
  expectedVariableName,
  letNotAllowed,
  notMutable,
  notReference,
  ownerBorrowed,
  readOnlyReference,
  referenceReassign,
  referenceUse,
  reservedName,
  undefinedName,
  unexpectedSemicolon,
} from "../errors";
import { applySign } from "../operations";
import { operandRef } from "./references";
import {
  Operator,
  isLetter,
  readDigits,
  readName,
  skipSpaces,
  toBracket,
} from "../scanner";
import type { Cell, ParserState } from "../types";
import { EntryKind, IfPhase, Step } from "../types";
import { borrowedBy, innermostGroup, lookupCell, pushOperand } from "./helpers";

// Names with a fixed meaning. They cannot be variable names.
const RESERVED_NAMES = new Set(["let", "mut", "true", "false", "if", "else"]);

function openBracket(state: ParserState, bracket: Bracket, sign: number): Step {
  const { ops, scopes, flags } = state;
  const top = ops[ops.length - 1];
  const ifCondition =
    top?.kind === EntryKind.If && top.phase === IfPhase.Condition;
  const discardable = top?.kind === EntryKind.If && top.phase === IfPhase.Then;
  ops.push({
    kind: EntryKind.Group,
    bracket,
    sign,
    where: state.pos,
    ifCondition,
    discardable,
    statementStart:
      bracket === Bracket.Brace &&
      sign === 1 &&
      state.depth === 0 &&
      flags.atStatementStart,
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
    statement: sign === 1 && state.depth === 0 && flags.atStatementStart,
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
  if (nameEnd === nameStart)
    return expectedVariableName(source, nameStart, "let");
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

// The operator of a compound assignment such as `+=`, given its first character.
function compoundOperator(ch: string): Operator | undefined {
  if (ch === "+") return Operator.Add;
  if (ch === "-") return Operator.Subtract;
  if (ch === "*") return Operator.Multiply;
  if (ch === "/") return Operator.Divide;
  return undefined;
}

// Reads `NAME =` at a statement start and leaves the parser ready for the value.
function startAssign(
  state: ParserState,
  name: string,
  nameStart: number,
  equals: number,
  operator: Operator | undefined,
): Failure<TuffError> | Step {
  const { source, ops, scopes, flags } = state;
  const cell = lookupCell(scopes, name);
  if (cell === undefined) return undefinedName(nameStart, name);
  if (cell.target !== undefined) return referenceReassign(nameStart, name);
  if (!cell.mutable) return notMutable(nameStart, name);
  ops.push({
    kind: EntryKind.Binding,
    name,
    mutable: false,
    assign: true,
    where: nameStart,
    operator,
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
    const literal = applySign(name === "true", sign, state.pos);
    if (typeof literal === "object") return literal;
    return pushOperand(state, literal, end);
  }
  const equals = skipSpaces(source, end);
  if (flags.atStatementStart && !signed && source.charAt(equals) === "=") {
    return startAssign(state, name, state.pos, equals, undefined);
  }
  const compound = compoundOperator(source.charAt(equals));
  if (
    flags.atStatementStart &&
    !signed &&
    compound !== undefined &&
    source.charAt(equals + 1) === "="
  ) {
    return startAssign(state, name, state.pos, equals + 1, compound);
  }
  const cell = lookupCell(scopes, name);
  if (cell === undefined) {
    return undefinedName(state.pos, name);
  }
  if (cell.target !== undefined) return referenceUse(state.pos, name);
  if (borrowedBy(scopes, cell, true)) {
    return ownerBorrowed(state.pos, name, false);
  }
  const value = applySign(cell.value, sign, state.pos);
  if (typeof value === "object") return value;
  return pushOperand(state, value, end);
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
  if (end === nameStart) return expectedVariableName(source, nameStart, "*");
  const name = source.slice(nameStart, end);
  const cell = lookupCell(scopes, name);
  if (cell === undefined) return undefinedName(nameStart, name);
  const target = cell.target;
  if (target === undefined) return notReference(nameStart, name);
  const equals = skipSpaces(source, end);
  if (flags.atStatementStart && !signed && source.charAt(equals) === "=") {
    return startDerefAssign(state, name, nameStart, equals, cell, target);
  }
  const value = applySign(target.value, sign, state.pos);
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
  const { source, ops, values, flags } = state;
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
    const group = innermostGroup(ops);
    if (group?.discardable === true) {
      const owner = ops[ops.length - 2];
      if (owner?.kind === EntryKind.If) owner.bodyEnd = state.pos;
      values.push(0);
      state.expectOperand = false;
      return Step.Continue;
    }
    if (group?.statementStart !== true || !flags.lastAssign) {
      return blockEndsWithStatement(state.pos);
    }
    group.discardValue = true;
    values.push(0);
    state.expectOperand = false;
    return Step.Continue;
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
