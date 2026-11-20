import type { Failure, TuffError } from "../errors";
import {
  Bracket,
  chainedComparison,
  closerFor,
  expectedClose,
  expectedElse,
  expectedMismatch,
  expectedOperator,
  expectedSemicolon,
  nonBooleanCondition,
  ownerBorrowed,
  typeMismatch,
  unexpectedSemicolon,
} from "../errors";
import {
  applyTop,
  closeGroup,
  isComparison,
  precedence,
  reduceOperators,
} from "../operations";
import {
  Operator,
  isCloser,
  readName,
  skipSpaces,
  toOperator,
} from "../scanner";
import type { BindingEntry, IfEntry, ParserState } from "../types";
import { EntryKind, IfPhase, Step } from "../types";
import {
  completeBranch,
  innermostGroup,
  innermostNonOperator,
  isLenient,
  lookupCell,
  attachRef,
  borrowedBy,
} from "./helpers";

// Starts the then-branch once the condition is known. An unchosen branch is
// still parsed for syntax, but its errors and assignments have no effect.
function startBranch(
  state: ParserState,
  closePos: number,
): Failure<TuffError> | Step {
  const { ops, values } = state;
  const entry = ops[ops.length - 1];
  if (entry?.kind !== EntryKind.If) return Step.Continue;
  const value = values.pop() ?? false;
  if (typeof value !== "boolean") return nonBooleanCondition(closePos);
  entry.condition = value === true;
  entry.phase = IfPhase.Then;
  entry.skipping = !entry.condition;
  if (entry.skipping) state.skipDepth++;
  state.expectOperand = true;
  return Step.Continue;
}

function pushOperator(
  state: ParserState,
  op: Operator,
): Failure<TuffError> | undefined {
  const { ops, values, flags } = state;
  // Left-associative: apply pending operators that bind at least as tightly.
  for (
    let top = ops[ops.length - 1];
    top?.kind === EntryKind.Operator &&
    precedence(top.operator) >= precedence(op);
    top = ops[ops.length - 1]
  ) {
    if (
      top?.kind === EntryKind.Operator &&
      isComparison(top.operator) &&
      isComparison(op)
    ) {
      return chainedComparison(state.pos);
    }
    const failure = applyTop(values, ops);
    if (failure !== undefined) return failure;
  }
  ops.push({ kind: EntryKind.Operator, operator: op, where: state.pos });
  state.pos += op.length;
  state.expectOperand = true;
  flags.atStatementStart = false;
  return undefined;
}

function endOfInput(state: ParserState): Failure<TuffError> | Step {
  const { source, ops } = state;
  const group = innermostGroup(ops);
  if (state.depth > 0 && group !== undefined) {
    return expectedClose(source, state.pos, group.bracket);
  }
  if (innermostNonOperator(ops)?.kind === EntryKind.Binding) {
    return expectedSemicolon(source, state.pos);
  }
  return Step.End;
}

// Completes a `let` or assignment: its value is the newest value. A `let` binds
// in the current scope; an assignment updates the nearest declaration.
function closeBinding(
  state: ParserState,
  binding: BindingEntry,
): Failure<TuffError> | undefined {
  const { ops, values, scopes, flags } = state;
  const lenient = isLenient(state);
  const reduced = reduceOperators(values, ops);
  if (reduced !== undefined) return reduced;
  ops.pop();
  const value = values.pop() ?? 0;
  if (binding.assign) {
    const cell = binding.target ?? lookupCell(scopes, binding.name);
    if (
      binding.target === undefined &&
      cell !== undefined &&
      borrowedBy(scopes, cell, false)
    ) {
      return ownerBorrowed(binding.where, binding.name, true);
    }
    if (cell !== undefined && typeof cell.value !== typeof value) {
      return typeMismatch(
        binding.where,
        binding.name,
        typeof cell.value,
        typeof value,
      );
    }
    if (cell !== undefined && !lenient) cell.value = value;
  } else {
    const cell =
      binding.target === undefined
        ? { value, mutable: binding.mutable }
        : {
            value,
            mutable: false,
            target: binding.target,
            exclusive: binding.exclusive,
          };
    const scope = scopes[scopes.length - 1];
    scope?.set(binding.name, cell);
  }
  flags.lastStatementEnded = true;
  if (state.depth === 0) flags.afterLet = true;
  return undefined;
}

function endStatement(state: ParserState): Failure<TuffError> | Step {
  const { source, ops, flags } = state;
  const open = innermostNonOperator(ops);
  if (open?.kind === EntryKind.Binding) {
    const failure = closeBinding(state, open);
    if (failure !== undefined) return failure;
    state.pos++;
    state.expectOperand = true;
    flags.atStatementStart = true;
    return Step.Continue;
  }
  if (open?.kind === EntryKind.Group) {
    return expectedClose(source, state.pos, open.bracket);
  }
  return unexpectedSemicolon(state.pos);
}

function closeBracket(
  state: ParserState,
  ch: string,
): Failure<TuffError> | Step {
  const { source, ops, values, scopes, flags } = state;
  if (innermostNonOperator(ops)?.kind === EntryKind.Binding) {
    return expectedSemicolon(source, state.pos);
  }
  const group = innermostGroup(ops);
  if (group === undefined) return expectedOperator(source, state.pos, true);
  if (ch !== closerFor(group.bracket)) {
    return expectedMismatch(source, state.pos, group.bracket);
  }
  const closePos = state.pos;
  const failure = closeGroup(values, ops);
  if (failure !== undefined) return failure;
  if (group.bracket === Bracket.Brace) scopes.pop();
  attachRef(ops, group.ref);
  state.depth--;
  state.pos++;
  flags.atStatementStart = false;
  if (group.ifCondition) return startBranch(state, closePos);
  return completeBranch(state) ?? Step.Continue;
}

// Reads the `else` that must follow a then-branch, and starts the else-branch.
function awaitElse(
  state: ParserState,
  entry: IfEntry,
): Failure<TuffError> | Step {
  const { source, flags } = state;
  const end = readName(source, state.pos);
  if (source.slice(state.pos, end) !== "else") {
    return expectedElse(source, state.pos);
  }
  entry.phase = IfPhase.Else;
  entry.skipping = entry.condition;
  if (entry.skipping) state.skipDepth++;
  state.pos = skipSpaces(source, end);
  state.expectOperand = true;
  flags.atStatementStart = false;
  return Step.Continue;
}

/**
 * Reads an operator, a closing bracket, else, or the end of the input.
 *
 * @param state - the parser state.
 * @returns the next step, or a failure.
 */
export function stepOperator(state: ParserState): Failure<TuffError> | Step {
  const { source, ops } = state;
  state.pos = skipSpaces(source, state.pos);
  const pending = innermostNonOperator(ops);
  if (pending?.kind === EntryKind.If) return awaitElse(state, pending);
  if (state.pos === source.length) return endOfInput(state);
  const ch = source.charAt(state.pos);
  if (ch === ";") return endStatement(state);
  if (state.depth > 0 && isCloser(ch)) return closeBracket(state, ch);
  const op = toOperator(source, state.pos);
  if (op === undefined) {
    if (innermostNonOperator(ops)?.kind === EntryKind.Binding) {
      return expectedSemicolon(source, state.pos);
    }
    return expectedOperator(source, state.pos, state.depth > 0);
  }
  return pushOperator(state, op) ?? Step.Continue;
}
