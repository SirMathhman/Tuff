import type { Failure, TuffError } from "./errors";
import {
  Bracket,
  blockEndsWithStatement,
  elseNotAllowed,
  expectedEquals,
  expectedIfParen,
  expectedNumber,
  expectedSemicolon,
  expectedVariableName,
  letNotAllowed,
  mutableReference,
  notMutable,
  notReference,
  referenceNotLet,
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
import type { ParserState, Value } from "./types";
import { EntryKind, IfPhase, Step } from "./types";
import { completeBranch, isLenient, lookupCell } from "./helpers";

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
  const value = applySign(cell.value, sign, state.pos, isLenient(state));
  if (typeof value === "object") return value;
  return pushOperand(state, value, end);
}

// Reads `&NAME`, which must be the whole value of a `let`. The reference is recorded
// on the binding, and a placeholder goes on the value stack for the statement end.
function operandRef(
  state: ParserState,
  signed: boolean,
): Failure<TuffError> | Step {
  const { source, ops, scopes } = state;
  const top = ops[ops.length - 1];
  if (signed || top?.kind !== EntryKind.Binding || top.assign) {
    return referenceNotLet(state.pos);
  }
  if (top.mutable) return mutableReference(top.where, top.name);
  const nameStart = skipSpaces(source, state.pos + 1);
  const end = readName(source, nameStart);
  if (end === nameStart) return expectedVariableName(source, nameStart);
  const name = source.slice(nameStart, end);
  const cell = lookupCell(scopes, name);
  if (cell === undefined) return undefinedName(nameStart, name);
  if (cell.target !== undefined) return referenceUse(nameStart, name);
  const semicolon = skipSpaces(source, end);
  if (source.charAt(semicolon) !== ";") {
    return expectedSemicolon(source, semicolon);
  }
  top.target = cell;
  return pushOperand(state, 0, end);
}

// Reads `*NAME`, which yields the value of the variable the reference points to.
function operandDeref(
  state: ParserState,
  sign: number,
): Failure<TuffError> | Step {
  const { source, scopes } = state;
  const nameStart = skipSpaces(source, state.pos + 1);
  const end = readName(source, nameStart);
  if (end === nameStart) return expectedVariableName(source, nameStart);
  const name = source.slice(nameStart, end);
  const cell = lookupCell(scopes, name);
  if (cell === undefined) return undefinedName(nameStart, name);
  const target = cell.target;
  if (target === undefined) return notReference(nameStart, name);
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
  if (ch === "*") return operandDeref(state, sign);
  if (isLetter(ch)) return operandName(state, sign, signed);
  return operandNumber(state, sign);
}
