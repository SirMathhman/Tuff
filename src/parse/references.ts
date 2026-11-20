import type { Failure, TuffError } from "../errors";
import {
  Bracket,
  expectedClose,
  expectedSemicolon,
  expectedVariableName,
  mutableBorrow,
  mutableReference,
  referenceNotLet,
  referenceOverlap,
  referenceUse,
  undefinedName,
} from "../errors";
import { borrowedBy, lookupCell, pushOperand } from "./helpers";
import { readName, skipSpaces } from "../scanner";
import type {
  BindingEntry,
  Cell,
  GroupEntry,
  ParserState,
  Scope,
  StackEntry,
} from "../types";
import { EntryKind, IfPhase, Step } from "../types";

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

/**
 * Reads `&NAME` or `&mut NAME`. It is recorded on the `let` it binds, or on the block or
 * if-branch that yields it, and a placeholder goes on the value stack.
 *
 * @param state - the parser state.
 * @param signed - whether a sign was written before the `&`.
 * @returns the next step, or a failure.
 */
export function operandRef(
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
  if (end === nameStart) return expectedVariableName(source, nameStart, "&");
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
    if (source.charAt(after) !== ";")
      return expectedSemicolon(source, after, "'let' statement");
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
