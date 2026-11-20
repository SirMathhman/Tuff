import type { Failure, TuffError } from "./errors";
import { applySign } from "./operations";
import type {
  BindingRef,
  Cell,
  GroupEntry,
  ParserState,
  Scope,
  StackEntry,
  Value,
} from "./types";
import { EntryKind, IfPhase, Step } from "./types";

/**
 * Reports whether a reference to a cell is in scope. With exclusiveOnly, only `&mut`
 * references count.
 *
 * @param scopes - the stack of block scopes.
 * @param cell - the variable that may be borrowed.
 * @param exclusiveOnly - whether only `&mut` references count.
 * @returns true when a matching reference is in scope.
 */
export function borrowedBy(
  scopes: Scope[],
  cell: Cell,
  exclusiveOnly: boolean,
): boolean {
  for (const scope of scopes) {
    for (const other of scope.values()) {
      if (
        other.target === cell &&
        (!exclusiveOnly || other.exclusive === true)
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Passes a reference yielded by a just-closed block or branch to the entry now on top:
 * a `let` takes it as its target, and an if-branch holds it until the if completes.
 *
 * @param ops - the operator stack, after the block or branch was removed.
 * @param ref - the reference the block or branch yielded, if any.
 */
export function attachRef(
  ops: StackEntry[],
  ref: BindingRef | undefined,
): void {
  const top = ops[ops.length - 1];
  if (ref === undefined || top === undefined) return;
  if (top.kind === EntryKind.Binding) {
    top.target = ref.target;
    top.exclusive = ref.exclusive;
  } else if (top.kind === EntryKind.If && !top.skipping) {
    top.ref = ref;
  }
}

/**
 * Reports whether the parser is inside an unchosen if branch, where errors are suppressed.
 *
 * @param state - the parser state.
 * @returns true while an unchosen branch is being parsed.
 */
export function isLenient(state: ParserState): boolean {
  return state.skipDepth > 0;
}

/**
 * Finds the newest open bracket on the operator stack.
 *
 * @param ops - the operator stack.
 * @returns the newest group entry, or undefined when none is open.
 */
export function innermostGroup(ops: StackEntry[]): GroupEntry | undefined {
  for (let idx = ops.length - 1; idx >= 0; idx--) {
    const entry = ops[idx];
    if (entry?.kind === EntryKind.Group) return entry;
  }
  return undefined;
}

/**
 * Finds the newest bracket, let, or if entry on the operator stack.
 *
 * @param ops - the operator stack.
 * @returns the newest non-operator entry, or undefined.
 */
export function innermostNonOperator(
  ops: StackEntry[],
): StackEntry | undefined {
  for (let idx = ops.length - 1; idx >= 0; idx--) {
    const entry = ops[idx];
    if (entry !== undefined && entry.kind !== EntryKind.Operator) return entry;
  }
  return undefined;
}

/**
 * Finds the nearest declaration of a name.
 *
 * @param scopes - the scopes, outermost first.
 * @param name - the variable name.
 * @returns the cell for the name, or undefined.
 */
export function lookupCell(scopes: Scope[], name: string): Cell | undefined {
  for (let idx = scopes.length - 1; idx >= 0; idx--) {
    const scope = scopes[idx];
    const cell = scope?.get(name);
    if (cell !== undefined) return cell;
  }
  return undefined;
}

/**
 * Completes if branches whose values are ready, possibly finishing enclosing ifs.
 *
 * @param state - the parser state.
 * @returns a failure from a negative sign on a boolean, or undefined.
 */
export function completeBranch(
  state: ParserState,
): Failure<TuffError> | undefined {
  const { ops, values } = state;
  for (;;) {
    const entry = ops[ops.length - 1];
    if (entry?.kind !== EntryKind.If) return undefined;
    if (entry.phase !== IfPhase.Then && entry.phase !== IfPhase.Else) {
      return undefined;
    }
    const value = values.pop() ?? 0;
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
    ops.pop();
    attachRef(ops, entry.ref);
    const result = applySign(entry.value ?? 0, entry.sign, entry.where);
    if (typeof result === "object") return result;
    values.push(result);
  }
}

/**
 * Pushes an operand onto the value stack and advances past its text.
 *
 * @param state - the parser state.
 * @param value - the operand's value.
 * @param end - the offset just past the operand's text.
 * @returns the next step, or a failure.
 */
export function pushOperand(
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
