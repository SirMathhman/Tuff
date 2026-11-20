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
import type { Cell, FuncDef, ParserState } from "../types";
import { EntryKind, Step } from "../types";
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

/**
 * Reads `fn NAME() => BODY;`. The body is not parsed here; each call parses it again.
 *
 * @param state - the parser state, positioned after the `fn` keyword's start.
 * @param keywordEnd - the offset just past the `fn` keyword.
 * @returns the next step, or a failure.
 */
export function startFn(
  state: ParserState,
  keywordEnd: number,
): Failure<TuffError> | Step {
  const { source, scopes, flags } = state;
  const nameStart = skipSpaces(source, keywordEnd);
  const nameEnd = readName(source, nameStart);
  if (nameEnd === nameStart)
    return expectedVariableName(source, nameStart, "fn");
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
  const func: FuncDef = { start, end, scopes: [] };
  const cell: Cell = { value: 0, mutable: false, func };
  const scope = scopes[scopes.length - 1];
  scope?.set(name, cell);
  // Copies of the scopes, so later declarations stay invisible; the cells are shared.
  func.scopes = scopes.map((visible) => new Map(visible));
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
 * Reads `NAME()` and starts parsing the function's body in the scopes of its declaration.
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
  const { source, ops, flags } = state;
  const open = skipSpaces(source, nameEnd);
  if (source.charAt(open) !== "(") return functionNotCalled(nameStart, name);
  const close = skipSpaces(source, open + 1);
  if (source.charAt(close) !== ")") return expectedText(source, close, ")");
  const openCalls = ops.filter((entry) => entry.kind === EntryKind.Call);
  if (openCalls.length >= MAX_CALL_DEPTH) return recursionTooDeep(nameStart);
  ops.push({
    kind: EntryKind.Call,
    sign,
    where: nameStart,
    returnPos: close + 1,
    end: func.end,
    scopes: state.scopes,
    depth: state.depth,
  });
  // A copy, so that the body's own blocks never change the stored scopes.
  const { scopes: captured } = func;
  state.scopes = captured.slice();
  state.depth = 0;
  state.pos = func.start;
  state.expectOperand = true;
  flags.atStatementStart = false;
  flags.lastStatementEnded = false;
  return Step.Continue;
}

/**
 * Ends the innermost call once its body has been parsed, restoring the caller's state.
 *
 * @param state - the parser state.
 * @returns a failure from reducing the body, or undefined.
 */
export function finishCall(state: ParserState): Failure<TuffError> | undefined {
  const { source, ops, values, flags } = state;
  const call = innermostNonOperator(ops);
  if (call?.kind !== EntryKind.Call) return undefined;
  if (skipSpaces(source, state.pos) < call.end) return undefined;
  const reduced = reduceOperators(values, ops);
  if (reduced !== undefined) return reduced;
  ops.pop();
  const signed = applySign(values.pop() ?? 0, call.sign, call.where);
  if (typeof signed === "object") return signed;
  values.push(signed);
  state.scopes = call.scopes;
  state.depth = call.depth;
  state.pos = call.returnPos;
  state.expectOperand = false;
  flags.atStatementStart = false;
  flags.lastStatementEnded = false;
  return completeBranch(state);
}
