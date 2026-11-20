import type { Failure, TuffError } from "./errors";
import { applySign } from "./operations";
import type { Cell, GroupEntry, ParserState, Scope, StackEntry } from "./types";
import { EntryKind, IfPhase } from "./types";

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
    const result = applySign(
      entry.value ?? 0,
      entry.sign,
      entry.where,
      isLenient(state),
    );
    if (typeof result === "object") return result;
    values.push(result);
  }
}
