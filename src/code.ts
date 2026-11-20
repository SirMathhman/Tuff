import type { Failure, Result, TuffError } from "./errors";
import {
  Bracket,
  chainedComparison,
  closerFor,
  expectedClose,
  expectedMismatch,
  expectedNumber,
  expectedOperator,
  undefinedName,
} from "./errors";
import { applySign, combine, isComparison, precedence } from "./operations";
import type { Value } from "./types";
import type { Operator } from "./scanner";
import {
  isCloser,
  isLetter,
  readDigits,
  readName,
  skipSpaces,
  toOperator,
} from "./scanner";

/**
 * One instruction of compiled code. Code runs left to right on a value stack.
 */
export interface Instruction {
  /** What the instruction does. */
  kind: InstructionKind;
  /** The offset in the source, for errors. */
  where: number;
  /** The value pushed, when the kind is push. */
  value?: Value;
  /** The variable read, when the kind is load. */
  name?: string;
  /** The sign applied, when the kind is sign. */
  sign?: number;
  /** The binary operator, when the kind is binary. */
  operator?: Operator;
}

/**
 * The kinds of compiled instruction.
 */
export enum InstructionKind {
  /** Push a literal value. */
  Push = "push",
  /** Push the value of a variable. */
  Load = "load",
  /** Apply a sign to the value on top. */
  Sign = "sign",
  /** Apply a binary operator to the two values on top. */
  Binary = "binary",
}

// A pending operator on the compiler's operator stack.
/**
 * A pending sign, operator, or open bracket on the compiler's stack.
 */
export interface Pending {
  /** The binary operator, or undefined for a sign or an open bracket. */
  operator?: Operator;
  /** The sign written before an operand, or undefined. */
  sign?: number;
  /** Whether this is an open bracket. */
  open: boolean;
  /** The offset of the pending item. */
  where: number;
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
 * Compiles an expression into instructions, using shunting-yard with an explicit stack.
 * Covers integers, booleans, variables, signs, brackets, and binary operators.
 *
 * @param source - the expression.
 * @returns the instructions, or a TuffError.
 */
export function compileExpression(
  source: string,
): Result<Instruction[], TuffError> {
  const code: Instruction[] = [];
  const stack: Pending[] = [];
  let pos = 0;
  let expectOperand = true;
  for (;;) {
    pos = skipSpaces(source, pos);
    if (pos >= source.length) break;
    const ch = source.charAt(pos);
    if (expectOperand) {
      const operand = readOperand(source, pos, code, stack);
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
    if (pending?.open === true)
      return expectedClose(source, pos, Bracket.Paren);
    if (pending !== undefined) emitPending(code, pending);
  }
  return { ok: true, value: code };
}

// Where reading an operand stopped, and whether the operand is complete.
interface Advance {
  /** The offset after what was read. */
  next: number;
  /** Whether a complete operand was read, so an operator must come next. */
  done: boolean;
}

// Reads an operand at `pos`: a sign, a bracket, a literal, or a name. Returns the next offset.
function readOperand(
  source: string,
  pos: number,
  code: Instruction[],
  stack: Pending[],
): Advance | Failure<TuffError> {
  let sign = 1;
  let at = pos;
  const ch = source.charAt(at);
  if (ch === "+" || ch === "-") {
    if (ch === "-") sign = -1;
    stack.push({ sign, open: false, where: at });
    at = skipSpaces(source, at + 1);
    if (source.charAt(at) === "+" || source.charAt(at) === "-")
      return expectedNumber(source, at);
  }
  const next = source.charAt(at);
  if (next === "(") {
    stack.push({ open: true, where: at });
    return { next: at + 1, done: false };
  }
  if (isLetter(next)) {
    const end = readName(source, at);
    const word = source.slice(at, end);
    if (word === "true" || word === "false") {
      code.push({
        kind: InstructionKind.Push,
        where: at,
        value: word === "true",
      });
    } else {
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
    )
      break;
    if (isComparison(top.operator) && isComparison(operator))
      return chainedComparison(pos);
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

/**
 * Runs compiled code with an explicit value stack.
 *
 * @param code - the instructions from compileExpression.
 * @param env - the value of each variable the code reads.
 * @returns the program's value, or a TuffError.
 */
export function runCode(
  code: Instruction[],
  env: Map<string, Value>,
): Result<number, TuffError> {
  const values: Value[] = [];
  for (const instruction of code) {
    const failure = step(instruction, values, env);
    if (failure !== undefined) return failure;
  }
  const result = values.pop() ?? 0;
  return {
    ok: true,
    value: typeof result === "boolean" ? Number(result) : result,
  };
}

// Runs one instruction against the value stack.
function step(
  instruction: Instruction,
  values: Value[],
  env: Map<string, Value>,
): Failure<TuffError> | undefined {
  const { kind, where } = instruction;
  if (kind === InstructionKind.Push) {
    values.push(instruction.value ?? 0);
    return undefined;
  }
  if (kind === InstructionKind.Load) {
    const name = instruction.name ?? "";
    const value = env.get(name);
    if (value === undefined) return undefinedName(where, name);
    values.push(value);
    return undefined;
  }
  if (kind === InstructionKind.Sign) {
    const signed = applySign(values.pop() ?? 0, instruction.sign ?? 1, where);
    if (typeof signed === "object") return signed;
    values.push(signed);
    return undefined;
  }
  const right = values.pop() ?? 0;
  const left = values.pop() ?? 0;
  const { operator } = instruction;
  if (operator === undefined) return undefined;
  const combined = combine(left, operator, right, where);
  if (typeof combined === "object") return combined;
  values.push(combined);
  return undefined;
}
