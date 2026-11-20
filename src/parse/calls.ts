import type { Failure, TuffError } from "../errors";
import {
  expectedNumber,
  expectedSemicolon,
  expectedText,
  expectedVariableName,
  functionNotCalled,
  recursionTooDeep,
} from "../errors";
import { applySign, reduceOperators } from "../operations";
import { readName, skipSpaces } from "../scanner";
import type { Cell, FuncDef, ParserState, Scope, StackEntry } from "../types";
import { CallMode, EntryKind, Step } from "../types";
import { completeBranch, innermostNonOperator } from "./helpers";

// The most calls that may be open at once, so a call that never ends stops with an error.
const MAX_CALL_DEPTH = 100;

// Offset just past a body starting at `start`: past its closing brace when braced,
// otherwise the ';' that ends it. Undefined at the end of input.
function bodyEndOf(source: string, start: number): number | undefined {
  const braced = source.charAt(start) === "{";
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    const ch = source.charAt(index);
    if (ch === "(" || ch === "{") {
      depth++;
    } else if (ch === ")" || ch === "}") {
      depth--;
      if (braced && depth === 0) return index + 1;
    } else if (ch === ";" && depth === 0 && !braced) {
      return index;
    }
  }
  return undefined;
}

// The scopes a function's body sees: those captured at its declaration, plus every
// function declared later in any scope that is still open (functions are hoisted).
function viewOf(func: FuncDef): Scope[] {
  const { scopes: captured, live, seq } = func;
  return captured.map((snapshot, index) => {
    const view: Scope = new Map(snapshot);
    const current: Scope | undefined = live[index];
    current?.forEach((cell, name) => {
      const declared = cell.func;
      if (declared !== undefined && declared.seq > seq) {
        view.set(name, cell);
      }
    });
    return view;
  });
}

/**
 * Reads `fn NAME() => BODY;`. The body is not run here: its check is deferred until
 * the enclosing block ends, and each call parses it again.
 *
 * @param state - the parser state.
 * @param keywordEnd - the offset just past the `fn` keyword.
 * @returns the next step, or a failure.
 */
export function startFn(
  state: ParserState,
  keywordEnd: number,
): Failure<TuffError> | Step {
  const { source, scopes, flags, functions } = state;
  const { pending, declared } = functions;
  const nameStart = skipSpaces(source, keywordEnd);
  const nameEnd = readName(source, nameStart);
  if (nameEnd === nameStart) {
    return expectedVariableName(source, nameStart, "fn");
  }
  const name = source.slice(nameStart, nameEnd);
  const open = skipSpaces(source, nameEnd);
  if (source.charAt(open) !== "(") return expectedText(source, open, "(");
  const close = skipSpaces(source, open + 1);
  if (source.charAt(close) !== ")") return expectedText(source, close, ")");
  const arrow = skipSpaces(source, close + 1);
  if (source.slice(arrow, arrow + 2) !== "=>") {
    return expectedText(source, arrow, "=>");
  }
  const start = skipSpaces(source, arrow + 2);
  const end = bodyEndOf(source, start);
  if (end === undefined) {
    return expectedSemicolon(source, source.length, "function declaration");
  }
  if (end === start) return expectedNumber(source, start);
  const func: FuncDef = {
    start,
    end,
    seq: declared,
    scopes: [],
    live: scopes.slice(),
  };
  functions.declared = declared + 1;
  const cell: Cell = { value: 0, mutable: false, func };
  const scope = scopes[scopes.length - 1];
  scope?.set(name, cell);
  // Copies of the scopes as they are now; the cells in them are shared.
  func.scopes = scopes.map((visible) => new Map(visible));
  pending.push({
    owner: scopes,
    depth: scopes.length,
    func,
    where: nameStart,
  });
  // A braced body needs no ';' after it; otherwise the ';' is consumed.
  const terminator = skipSpaces(source, end);
  state.pos = source.charAt(terminator) === ";" ? terminator + 1 : end;
  state.expectOperand = true;
  flags.atStatementStart = true;
  flags.lastStatementEnded = true;
  flags.lastAssign = false;
  if (state.depth === 0) flags.afterLet = true;
  return Step.Continue;
}

/**
 * Runs the deferred check of a function declared in the block that is closing, or at
 * the end of the input for top-level functions. The check parses the body in lenient mode.
 *
 * @param state - the parser state.
 * @returns true when a check was started.
 */
export function startDeferredCheck(state: ParserState): boolean {
  const { source, ops, values, scopes, flags, functions } = state;
  const { pending } = functions;
  const at = skipSpaces(source, state.pos);
  const closing = state.depth > 0 && source.charAt(at) === "}";
  const ending = state.depth === 0 && at >= source.length;
  if (!closing && !ending) return false;
  const index = pending.findIndex(
    (entry) => entry.owner === scopes && entry.depth === scopes.length,
  );
  const entry = pending[index];
  if (entry === undefined) return false;
  pending.splice(index, 1);
  const { func } = entry;
  const braced = source.charAt(func.start) === "{";
  ops.push({
    kind: EntryKind.Call,
    sign: 1,
    where: entry.where,
    returnPos: at,
    end: func.end,
    scopes,
    depth: state.depth,
    base: values.length,
    mode: CallMode.Check,
    resume: {
      expectOperand: state.expectOperand,
      atStatementStart: flags.atStatementStart,
      lastStatementEnded: flags.lastStatementEnded,
      lastAssign: flags.lastAssign,
      afterLet: flags.afterLet,
    },
  });
  state.skipDepth++;
  state.scopes = viewOf(func);
  state.depth = 0;
  state.pos = func.start;
  state.expectOperand = true;
  flags.atStatementStart = braced;
  flags.lastStatementEnded = false;
  return true;
}

/**
 * Reads `NAME()` and starts parsing the function's body in the scopes it sees.
 *
 * @param state - the parser state.
 * @param name - the function's name.
 * @param nameStart - the offset of the name.
 * @param nameEnd - the offset just past the name.
 * @param func - the declared function being called.
 * @param sign - the sign written before the call.
 * @returns the next step, or a failure.
 */
export function startCall(
  state: ParserState,
  name: string,
  nameStart: number,
  nameEnd: number,
  func: FuncDef,
  sign: number,
): Failure<TuffError> | Step {
  const { source, ops, values, flags } = state;
  const open = skipSpaces(source, nameEnd);
  if (source.charAt(open) !== "(") return functionNotCalled(nameStart, name);
  const close = skipSpaces(source, open + 1);
  if (source.charAt(close) !== ")") return expectedText(source, close, ")");
  const openCalls = ops.filter((entry) => entry.kind === EntryKind.Call);
  if (openCalls.length >= MAX_CALL_DEPTH) return recursionTooDeep(nameStart);
  const statement = flags.atStatementStart && state.depth === 0 && sign === 1;
  ops.push({
    kind: EntryKind.Call,
    sign,
    where: nameStart,
    returnPos: close + 1,
    end: func.end,
    scopes: state.scopes,
    depth: state.depth,
    base: values.length,
    mode: statement ? CallMode.Statement : CallMode.Expression,
    resume: {
      expectOperand: state.expectOperand,
      atStatementStart: flags.atStatementStart,
      lastStatementEnded: flags.lastStatementEnded,
      lastAssign: flags.lastAssign,
      afterLet: flags.afterLet,
    },
  });
  state.scopes = viewOf(func);
  state.depth = 0;
  state.pos = func.start;
  state.expectOperand = true;
  // A braced body is a block, so it can end in a statement and then has no value.
  flags.atStatementStart = source.charAt(func.start) === "{";
  flags.lastStatementEnded = false;
  return Step.Continue;
}

/**
 * Ends the innermost call or deferred check once its body has been parsed,
 * restoring the caller's state.
 *
 * @param state - the parser state.
 * @returns a failure, a Continue step when a call finished, or undefined when none did.
 */
export function finishCall(
  state: ParserState,
): Failure<TuffError> | Step | undefined {
  const { source, ops, values, flags } = state;
  const call: StackEntry | undefined = innermostNonOperator(ops);
  if (call?.kind !== EntryKind.Call) return undefined;
  if (skipSpaces(source, state.pos) < call.end) return undefined;
  const reduced = reduceOperators(values, ops);
  if (reduced !== undefined) return reduced;
  ops.pop();
  state.scopes = call.scopes;
  state.depth = call.depth;
  state.pos = call.returnPos;
  // A body that ends in a statement pushes no value, so only pop what it pushed.
  const value = values.length > call.base ? (values.pop() ?? 0) : 0;
  if (call.mode === CallMode.Check) {
    const saved = call.resume;
    state.skipDepth--;
    state.expectOperand = saved.expectOperand;
    flags.atStatementStart = saved.atStatementStart;
    flags.lastStatementEnded = saved.lastStatementEnded;
    flags.lastAssign = saved.lastAssign;
    flags.afterLet = saved.afterLet;
    return Step.Continue;
  }
  const next = skipSpaces(source, call.returnPos);
  if (call.mode === CallMode.Statement && source.charAt(next) === ";") {
    state.pos = next + 1;
    state.expectOperand = true;
    flags.atStatementStart = true;
    flags.lastStatementEnded = true;
    flags.lastAssign = false;
    if (state.depth === 0) flags.afterLet = true;
    return Step.Continue;
  }
  const signed = applySign(value, call.sign, call.where);
  if (typeof signed === "object") return signed;
  values.push(signed);
  state.expectOperand = false;
  flags.atStatementStart = false;
  flags.lastStatementEnded = false;
  return completeBranch(state) ?? Step.Continue;
}

/**
 * Ends every call whose body has been fully parsed, innermost first.
 *
 * @param state - the parser state.
 * @returns a failure from reducing a body, or undefined.
 */
export function finishCalls(
  state: ParserState,
): Failure<TuffError> | undefined {
  let outcome = finishCall(state);
  while (outcome === Step.Continue) outcome = finishCall(state);
  return typeof outcome === "object" ? outcome : undefined;
}
