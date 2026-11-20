import type { Failure, Result, TuffError } from "./errors";
import {
  blockEndsWithStatement,
  Bracket,
  chainedComparison,
  closerFor,
  elseNotAllowed,
  expectedClose,
  expectedElse,
  expectedEquals,
  expectedIfParen,
  expectedMismatch,
  expectedNumber,
  expectedOperator,
  expectedSemicolon,
  expectedVariableName,
  letNotAllowed,
  nonBooleanCondition,
  notMutable,
  reservedName,
  typeMismatch,
  undefinedName,
  unexpectedSemicolon,
} from "./errors";
import {
  applySign,
  applyTop,
  closeGroup,
  isComparison,
  precedence,
  reduceOperators,
} from "./operations";
import {
  isCloser,
  isLetter,
  Operator,
  readDigits,
  readName,
  skipSpaces,
  toBracket,
  toOperator,
} from "./scanner";
import { EntryKind, IfPhase, Step } from "./types";
import type {
  BindingEntry,
  Cell,
  GroupEntry,
  IfEntry,
  ParserState,
  Scope,
  StackEntry,
  Value,
} from "./types";

// Names with a fixed meaning. They cannot be variable names.
const RESERVED_NAMES = new Set(["let", "mut", "true", "false", "if", "else"]);

function isLenient(state: ParserState): boolean {
  return state.skipDepth > 0;
}

// The newest open bracket on the stack, or undefined when none is open.
function innermostGroup(ops: StackEntry[]): GroupEntry | undefined {
  for (let idx = ops.length - 1; idx >= 0; idx--) {
    const entry = ops[idx];
    if (entry?.kind === EntryKind.Group) return entry;
  }
  return undefined;
}

// The newest open bracket, `let`, or `if` on the stack, or undefined when there is none.
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

// Completes an `if` branch once its value is complete. A then-branch waits for
// `else`. A completed else-branch finishes the whole `if`, and its value takes
// the place of the `if` on the value stack, which may complete an enclosing branch.
function completeBranch(state: ParserState): Failure<TuffError> | undefined {
  for (;;) {
    const entry = state.ops[state.ops.length - 1];
    if (entry?.kind !== EntryKind.If) return undefined;
    if (entry.phase !== IfPhase.Then && entry.phase !== IfPhase.Else) {
      return undefined;
    }
    const value = state.values.pop() ?? 0;
    if (entry.skipping) {
      state.skipDepth--;
      entry.skipping = false;
    } else {
      entry.value = value;
    }
    if (entry.phase === IfPhase.Then) {
      entry.phase = IfPhase.AwaitElse;
      return undefined;
    }
    state.ops.pop();
    const result = applySign(
      entry.value ?? 0,
      entry.sign,
      entry.where,
      isLenient(state),
    );
    if (typeof result === "object") return result;
    state.values.push(result);
  }
}

function pushOperand(
  state: ParserState,
  value: Value,
  end: number,
): Failure<TuffError> | Step {
  state.flags.lastStatementEnded = false;
  state.values.push(value);
  state.pos = end;
  state.expectOperand = false;
  state.flags.atStatementStart = false;
  return completeBranch(state) ?? Step.Continue;
}

function openBracket(state: ParserState, bracket: Bracket, sign: number): Step {
  const top = state.ops[state.ops.length - 1];
  const ifCondition =
    top?.kind === EntryKind.If && top.phase === IfPhase.Condition;
  state.ops.push({
    kind: EntryKind.Group,
    bracket,
    sign,
    where: state.pos,
    ifCondition,
  });
  if (bracket === Bracket.Brace) state.scopes.push(new Map());
  state.depth++;
  state.pos++;
  state.flags.atStatementStart = bracket === Bracket.Brace;
  return Step.Continue;
}

// Reads `if` and waits for its parenthesized condition.
function startIf(state: ParserState, sign: number, end: number): Step {
  state.ops.push({
    kind: EntryKind.If,
    phase: IfPhase.Condition,
    sign,
    where: state.pos,
    condition: false,
    skipping: false,
    value: undefined,
  });
  state.pos = end;
  state.flags.atStatementStart = false;
  return Step.Continue;
}

// Starts the then-branch once the condition is known. An unchosen branch is
// still parsed for syntax, but its errors and assignments have no effect.
function startBranch(
  state: ParserState,
  closePos: number,
): Failure<TuffError> | Step {
  const entry = state.ops[state.ops.length - 1];
  if (entry?.kind !== EntryKind.If) return Step.Continue;
  const value = state.values.pop() ?? false;
  if (typeof value !== "boolean" && !isLenient(state)) {
    return nonBooleanCondition(closePos);
  }
  entry.condition = value === true;
  entry.phase = IfPhase.Then;
  entry.skipping = !entry.condition;
  if (entry.skipping) state.skipDepth++;
  state.expectOperand = true;
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
  state.ops.push({
    kind: EntryKind.Binding,
    name,
    mutable,
    assign: false,
    where: nameStart,
  });
  state.pos = skipSpaces(state.source, equals + 1);
  state.expectOperand = true;
  state.flags.atStatementStart = false;
  return Step.Continue;
}

// Reads `NAME =` at a statement start and leaves the parser ready for the value.
function startAssign(
  state: ParserState,
  name: string,
  nameStart: number,
  equals: number,
): Failure<TuffError> | Step {
  if (!isLenient(state)) {
    const cell = lookupCell(state.scopes, name);
    if (cell === undefined) return undefinedName(nameStart, name);
    if (!cell.mutable) return notMutable(nameStart, name);
  }
  state.ops.push({
    kind: EntryKind.Binding,
    name,
    mutable: false,
    assign: true,
    where: nameStart,
  });
  state.pos = skipSpaces(state.source, equals + 1);
  state.expectOperand = true;
  state.flags.atStatementStart = false;
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
    if (state.flags.atStatementStart && !signed) return startLet(state, end);
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
  const equals = skipSpaces(state.source, end);
  if (
    state.flags.atStatementStart &&
    !signed &&
    state.source.charAt(equals) === "="
  ) {
    return startAssign(state, name, state.pos, equals);
  }
  const cell = lookupCell(state.scopes, name);
  if (cell === undefined) {
    if (isLenient(state)) return pushOperand(state, 0, end);
    return undefinedName(state.pos, name);
  }
  const value = applySign(cell.value, sign, state.pos, isLenient(state));
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

// Reads an operand: a sign, then a number, a variable, a boolean, an `if`, or an opening bracket.
function stepOperand(state: ParserState): Failure<TuffError> | Step {
  state.pos = skipSpaces(state.source, state.pos);
  if (
    state.flags.atStatementStart &&
    state.depth === 0 &&
    state.flags.afterLet &&
    state.pos === state.source.length
  ) {
    return Step.End;
  }
  if (
    state.flags.atStatementStart &&
    state.depth > 0 &&
    state.flags.lastStatementEnded &&
    state.source.charAt(state.pos) === "}"
  ) {
    return blockEndsWithStatement(state.pos);
  }
  if (state.flags.atStatementStart && state.source.charAt(state.pos) === ";") {
    return unexpectedSemicolon(state.pos);
  }
  const top = state.ops[state.ops.length - 1];
  if (
    top?.kind === EntryKind.If &&
    top.phase === IfPhase.Condition &&
    state.source.charAt(state.pos) !== "("
  ) {
    return expectedIfParen(state.source, state.pos);
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
    if (
      top?.kind === EntryKind.Operator &&
      isComparison(top.operator) &&
      isComparison(op)
    ) {
      return chainedComparison(state.pos);
    }
    const failure = applyTop(state.values, state.ops, isLenient(state));
    if (failure !== undefined) return failure;
  }
  state.ops.push({ kind: EntryKind.Operator, operator: op, where: state.pos });
  state.pos += op.length;
  state.expectOperand = true;
  state.flags.atStatementStart = false;
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

// Completes a `let` or assignment: its value is the newest value. A `let` binds
// in the current scope; an assignment updates the nearest declaration.
function closeBinding(
  state: ParserState,
  binding: BindingEntry,
): Failure<TuffError> | undefined {
  const lenient = isLenient(state);
  const reduced = reduceOperators(state.values, state.ops, lenient);
  if (reduced !== undefined) return reduced;
  state.ops.pop();
  const value = state.values.pop() ?? 0;
  if (binding.assign) {
    const cell = lookupCell(state.scopes, binding.name);
    if (cell !== undefined && !lenient) {
      if (typeof cell.value !== typeof value) {
        return typeMismatch(
          binding.where,
          binding.name,
          typeof cell.value,
          typeof value,
        );
      }
      cell.value = value;
    }
  } else {
    const cell = { value, mutable: binding.mutable };
    state.scopes[state.scopes.length - 1]?.set(binding.name, cell);
  }
  state.flags.lastStatementEnded = true;
  if (state.depth === 0) state.flags.afterLet = true;
  return undefined;
}

function endStatement(state: ParserState): Failure<TuffError> | Step {
  const open = innermostNonOperator(state.ops);
  if (open?.kind === EntryKind.Binding) {
    const failure = closeBinding(state, open);
    if (failure !== undefined) return failure;
    state.pos++;
    state.expectOperand = true;
    state.flags.atStatementStart = true;
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
  const closePos = state.pos;
  const failure = closeGroup(state.values, state.ops, isLenient(state));
  if (failure !== undefined) return failure;
  if (group.bracket === Bracket.Brace) state.scopes.pop();
  state.depth--;
  state.pos++;
  state.flags.atStatementStart = false;
  if (group.ifCondition) return startBranch(state, closePos);
  return completeBranch(state) ?? Step.Continue;
}

// Reads the `else` that must follow a then-branch, and starts the else-branch.
function awaitElse(
  state: ParserState,
  entry: IfEntry,
): Failure<TuffError> | Step {
  const end = readName(state.source, state.pos);
  if (state.source.slice(state.pos, end) !== "else") {
    return expectedElse(state.source, state.pos);
  }
  entry.phase = IfPhase.Else;
  entry.skipping = entry.condition;
  if (entry.skipping) state.skipDepth++;
  state.pos = skipSpaces(state.source, end);
  state.expectOperand = true;
  state.flags.atStatementStart = false;
  return Step.Continue;
}

// Reads an operator, a closing bracket, `else`, or the end of the input.
function stepOperator(state: ParserState): Failure<TuffError> | Step {
  state.pos = skipSpaces(state.source, state.pos);
  const pending = innermostNonOperator(state.ops);
  if (pending?.kind === EntryKind.If) return awaitElse(state, pending);
  if (state.pos === state.source.length) return endOfInput(state);
  const ch = state.source.charAt(state.pos);
  if (ch === ";") return endStatement(state);
  if (state.depth > 0 && isCloser(ch)) return closeBracket(state, ch);
  const op = toOperator(state.source, state.pos);
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
 * comparisons, signs, parentheses, braces, and `if (condition) a else b` are
 * supported. A boolean cannot be used in arithmetic. Only the chosen branch of an
 * `if` takes effect, so errors in the other branch are ignored. The final value of
 * a boolean program is 1 or 0. Braces open a block scope, and the value of a block
 * is its last expression. Uses explicit stacks, so nesting depth is not limited by
 * the JavaScript call stack. Offsets in errors refer to the unmodified source.
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
    skipDepth: 0,
    expectOperand: true,
    flags: {
      atStatementStart: true,
      afterLet: false,
      lastStatementEnded: false,
    },
  };
  for (;;) {
    const outcome = state.expectOperand
      ? stepOperand(state)
      : stepOperator(state);
    if (outcome === Step.End) break;
    if (outcome !== Step.Continue) return outcome;
  }
  const failure = reduceOperators(state.values, state.ops, isLenient(state));
  if (failure !== undefined) return failure;
  const result = state.values.pop() ?? 0;
  return {
    ok: true,
    value: typeof result === "boolean" ? Number(result) : result,
  };
}
