import type { Failure, Result, TuffError } from "./errors";
import {
  Bracket,
  chainedComparison,
  closerFor,
  expectedClose,
  expectedMismatch,
  expectedNumber,
  expectedOperator,
  expectedSemicolon,
  fail,
  undefinedName,
  unexpectedSemicolon,
} from "./errors";
import { isComparison, precedence } from "./operations";
import type { Operator } from "./scanner";
import {
  isCloser,
  isLetter,
  matchingClose,
  readDigits,
  readName,
  signOf,
  skipSpaces,
  toOperator,
} from "./scanner";
import type {
  Advance,
  Compiled,
  Instruction,
  Names,
  Pending,
  Unit,
} from "./instructions";
import { InstructionKind, UnitKind } from "./instructions";

// The message of the marker that tells the caller to fall back to the parser.
export const UNSUPPORTED_WHAT = "Unsupported construct";

// Words the compiled path does not handle yet; a program using one falls back to the parser.
const UNSUPPORTED_WORDS = new Set([
  "else",
  "fn",
  "while",
  "match",
  "case",
  "mut",
  "let",
]);

/**
 * A failure that means "not handled by the compiled path".
 *
 * @param where - the offset of the construct.
 * @returns the marker failure.
 */
export function unsupportedAt(where: number): Failure<TuffError> {
  return fail(
    UNSUPPORTED_WHAT,
    where,
    "The compiled path does not handle this construct yet.",
    "Fall back to the parser.",
  );
}

// Whether the text at `pos` is a brace that opens an object literal: `{ name :`.
function opensObject(source: string, pos: number): boolean {
  const start = skipSpaces(source, pos + 1);
  const end = readName(source, start);
  if (end === start) return false;
  return source.charAt(skipSpaces(source, end)) === ":";
}

// Whether an open bracket is still waiting to be closed.
function hasOpenBracket(stack: Pending[]): boolean {
  return stack.some((pending) => pending.open);
}

// Emits a pending sign or operator as an instruction.
function emitPending(code: Instruction[], pending: Pending): void {
  if (pending.operator !== undefined) {
    code.push({
      kind: InstructionKind.Binary,
      where: pending.where,
      operator: pending.operator,
    });
  } else if (pending.sign !== undefined) {
    code.push({
      kind: InstructionKind.Sign,
      where: pending.where,
      sign: pending.sign,
    });
  }
}

/**
 * Compiles an expression from `start`. With a statement noun, it stops at the ';' that
 * ends the statement, and a missing ';' is reported for that noun. With a stop character,
 * it also stops at that character outside brackets.
 *
 * @param source - the program text.
 * @param start - the offset where the expression starts.
 * @param names - the variables visible to the expression.
 * @param noun - the statement the expression belongs to, or undefined.
 * @param queue - the units still to compile, where blocks are queued.
 * @param stop - a character that ends the expression, or undefined.
 * @returns the instructions and the offset after them, or a TuffError.
 */
export function compileFrom(
  source: string,
  start: number,
  names: Names,
  noun: string | undefined,
  queue: Unit[],
  stop: string | undefined,
): Result<Compiled, TuffError> {
  const code: Instruction[] = [];
  const stack: Pending[] = [];
  let pos = start;
  let expectOperand = true;
  for (;;) {
    pos = skipSpaces(source, pos);
    if (pos >= source.length) break;
    const ch = source.charAt(pos);
    if (
      noun !== undefined &&
      !hasOpenBracket(stack) &&
      !expectOperand &&
      ch === ";"
    ) {
      break;
    }
    if (stop !== undefined && !hasOpenBracket(stack) && ch === stop) break;
    if (expectOperand) {
      const operand = readOperand(source, pos, code, stack, names, queue);
      if (!("next" in operand)) return operand;
      pos = operand.next;
      expectOperand = !operand.done;
      continue;
    }
    if (ch === ")" || isCloser(ch)) {
      const failure = closeGroup(source, pos, code, stack);
      if (failure !== undefined) return failure;
      pos++;
      continue;
    }
    const operator = toOperator(source, pos);
    if (operator === undefined) {
      if (noun !== undefined && !hasOpenBracket(stack)) {
        return expectedSemicolon(source, pos, noun);
      }
      if (ch === ";") return unexpectedSemicolon(pos);
      return expectedOperator(source, pos, stack.length > 0);
    }
    const failure = pushOperator(operator, pos, code, stack);
    if (failure !== undefined) return failure;
    pos += operator.length;
    expectOperand = true;
  }
  if (expectOperand) return expectedNumber(source, pos);
  for (let index = stack.length - 1; index >= 0; index--) {
    const pending = stack[index];
    if (pending?.open === true) {
      return expectedClose(source, pos, Bracket.Paren);
    }
    if (pending !== undefined) emitPending(code, pending);
  }
  if (noun !== undefined && pos >= source.length) {
    return expectedSemicolon(source, pos, noun);
  }
  return { ok: true, value: { code, next: pos } };
}

// Reads an operand at `pos`: a sign, a bracket, a block, a literal, or a name.
function readOperand(
  source: string,
  pos: number,
  code: Instruction[],
  stack: Pending[],
  names: Names,
  queue: Unit[],
): Advance | Failure<TuffError> {
  let at = pos;
  const ch = source.charAt(at);
  const written = signOf(ch);
  if (written !== undefined) {
    at++;
    stack.push({ sign: written, open: false, where: at });
    if (source.charAt(at) === "+" || source.charAt(at) === "-") {
      return expectedNumber(source, at);
    }
  }
  const next = source.charAt(at);
  if (next === "[" || next === "&" || next === "*") return unsupportedAt(at);
  if (next === "(") {
    stack.push({ open: true, where: at });
    return { next: at + 1, done: false };
  }
  if (next === "{") {
    if (opensObject(source, at)) return unsupportedAt(at);
    const close = matchingClose(source, at);
    if (close === undefined) {
      return expectedClose(source, source.length, Bracket.Brace);
    }
    const body: Instruction[] = [];
    code.push({ kind: InstructionKind.Enter, where: at, block: body });
    queue.push({
      code: body,
      pos: at + 1,
      names: new Map(names),
      kind: UnitKind.Block,
    });
    return { next: finishOperand(close + 1, code, stack), done: true };
  }
  if (isLetter(next)) {
    const end = readName(source, at);
    const word = source.slice(at, end);
    if (word === "if")
      return readIf(source, at, end, code, stack, names, queue);
    if (UNSUPPORTED_WORDS.has(word)) return unsupportedAt(at);
    if (word === "true" || word === "false") {
      code.push({
        kind: InstructionKind.Push,
        where: at,
        value: word === "true",
      });
    } else {
      if (!names.has(word)) return undefinedName(at, word);
      code.push({ kind: InstructionKind.Load, where: at, name: word });
    }
    return { next: finishOperand(end, code, stack), done: true };
  }
  const end = readDigits(source, at);
  if (end === at) return expectedNumber(source, at);
  code.push({
    kind: InstructionKind.Push,
    where: at,
    value: parseInt(source.slice(at, end), 10),
  });
  return { next: finishOperand(end, code, stack), done: true };
}

// After an operand, applies any signs written directly before it.
function finishOperand(
  end: number,
  code: Instruction[],
  stack: Pending[],
): number {
  for (;;) {
    const top = stack[stack.length - 1];
    if (top?.sign === undefined) break;
    stack.pop();
    emitPending(code, top);
  }
  return end;
}

// Reads `if (condition) { then } else { otherwise }` from the word `if`. The condition is
// queued as its own unit, and each branch as a block or a single operand; Branch runs them
// and Pick chooses.
// Any other shape is unsupported, so the parser reports it.
function readIf(
  source: string,
  at: number,
  end: number,
  code: Instruction[],
  stack: Pending[],
  names: Names,
  queue: Unit[],
): Advance | Failure<TuffError> {
  const open = skipSpaces(source, end);
  if (source.charAt(open) !== "(") return unsupportedAt(at);
  const close = matchingClose(source, open);
  if (close === undefined) return unsupportedAt(at);
  const thenStart = skipSpaces(source, close + 1);
  const thenEnd = branchEnd(source, thenStart);
  if (thenEnd === undefined) return unsupportedAt(at);
  const elseWord = skipSpaces(source, thenEnd);
  const elseEnd = readName(source, elseWord);
  if (source.slice(elseWord, elseEnd) !== "else") return unsupportedAt(at);
  const elseStart = skipSpaces(source, elseEnd);
  const elseStop = branchEnd(source, elseStart);
  if (elseStop === undefined) return unsupportedAt(at);
  const conditionCode: Instruction[] = [];
  const thenCode: Instruction[] = [];
  const elseCode: Instruction[] = [];
  code.push({ kind: InstructionKind.Enter, where: at, block: conditionCode });
  code.push({
    kind: InstructionKind.Branch,
    where: close,
    block: thenCode,
    otherwise: elseCode,
  });
  code.push({ kind: InstructionKind.Pick, where: at });
  queue.push({
    code: conditionCode,
    pos: open + 1,
    names: new Map(names),
    kind: UnitKind.Condition,
  });
  queue.push(branchUnit(source, thenStart, thenCode, names));
  queue.push(branchUnit(source, elseStart, elseCode, names));
  return { next: finishOperand(elseStop, code, stack), done: true };
}

// Where a branch of an if ends: after its braces, or after its single operand. Undefined
// for any other shape, which the parser handles.
function branchEnd(source: string, start: number): number | undefined {
  if (source.charAt(start) === "{") {
    const close = matchingClose(source, start);
    return close === undefined ? undefined : close + 1;
  }
  const sign = signOf(source.charAt(start));
  const at = sign === undefined ? start : start + 1;
  if (isLetter(source.charAt(at))) {
    const end = readName(source, at);
    return source.slice(at, end) === "if" ? undefined : end;
  }
  const end = readDigits(source, at);
  return end === at ? undefined : end;
}

// The unit that compiles one branch: a braced block, or a single operand.
function branchUnit(
  source: string,
  start: number,
  code: Instruction[],
  names: Names,
): Unit {
  const kind = source.charAt(start) === "{" ? UnitKind.Block : UnitKind.Factor;
  const pos = kind === UnitKind.Block ? start + 1 : start;
  return { code, pos, names: new Map(names), kind };
}

/**
 * Compiles a single-operand branch of an if into its own code. Any other operand is
 * unsupported here, so the parser handles it.
 *
 * @param source - the program text.
 * @param unit - the factor unit, whose code receives the instructions.
 * @param queue - the units still to compile.
 * @returns success, or the unsupported marker.
 */
export function compileFactor(
  source: string,
  unit: Unit,
  queue: Unit[],
): Result<true, TuffError> {
  const result = readOperand(
    source,
    unit.pos,
    unit.code,
    [],
    unit.names,
    queue,
  );
  if (!("next" in result) || !result.done) return unsupportedAt(unit.pos);
  return { ok: true, value: true };
}

// Applies pending operators that bind at least as tightly, then pushes this one.
function pushOperator(
  operator: Operator,
  pos: number,
  code: Instruction[],
  stack: Pending[],
): Failure<TuffError> | undefined {
  for (;;) {
    const top = stack[stack.length - 1];
    if (
      top?.operator === undefined ||
      precedence(top.operator) < precedence(operator)
    ) {
      break;
    }
    if (isComparison(top.operator) && isComparison(operator)) {
      return chainedComparison(pos);
    }
    stack.pop();
    emitPending(code, top);
  }
  stack.push({ operator, open: false, where: pos });
  return undefined;
}

// Closes the innermost bracket, emitting what it contains.
function closeGroup(
  source: string,
  pos: number,
  code: Instruction[],
  stack: Pending[],
): Failure<TuffError> | undefined {
  for (;;) {
    const top = stack.pop();
    if (top === undefined) return expectedOperator(source, pos, false);
    if (top.open) {
      if (source.charAt(pos) !== closerFor(Bracket.Paren)) {
        return expectedMismatch(source, pos, Bracket.Paren);
      }
      break;
    }
    emitPending(code, top);
  }
  for (;;) {
    const top = stack[stack.length - 1];
    if (top?.sign === undefined) break;
    stack.pop();
    emitPending(code, top);
  }
  return undefined;
}
