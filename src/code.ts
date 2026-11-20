import type { Failure, Result, TuffError } from "./errors";
import {
  Bracket,
  chainedComparison,
  closerFor,
  expectedClose,
  expectedEquals,
  expectedMismatch,
  expectedNumber,
  expectedOperator,
  expectedSemicolon,
  expectedVariableName,
  notMutable,
  reservedName,
  typeMismatch,
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
  /** The variable read or written, when the kind is load, declare, or assign. */
  name?: string;
  /** The sign applied, when the kind is sign. */
  sign?: number;
  /** The binary operator, when the kind is binary. */
  operator?: Operator;
  /** Whether a declared variable may be reassigned, when the kind is declare. */
  mutable?: boolean;
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
  /** Pop a value and bind it to a new variable. */
  Declare = "declare",
  /** Pop a value and store it into an existing variable. */
  Assign = "assign",
}

/**
 * A variable at run time: its value, and whether it may be reassigned.
 */
export interface Binding {
  /** The current value. */
  value: Value;
  /** Whether the variable may be reassigned. */
  mutable: boolean;
}

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

/**
 * The variables visible while compiling: whether each may be reassigned.
 */
export type Names = Map<string, boolean>;

// Where reading an operand stopped, and whether the operand is complete.
interface Advance {
  /** The offset after what was read. */
  next: number;
  /** Whether a complete operand was read, so an operator must come next. */
  done: boolean;
}

// A compiled expression or statement, and the offset after it.
interface Compiled {
  /** The instructions. */
  code: Instruction[];
  /** The offset after the compiled text. */
  next: number;
}

// Words that have a fixed meaning and cannot name a variable.
const RESERVED_NAMES = new Set([
  "let",
  "mut",
  "true",
  "false",
  "if",
  "else",
  "fn",
  "while",
  "match",
  "case",
]);

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
 * Compiles an expression with no variables into instructions.
 *
 * @param source - the expression.
 * @returns the instructions, or a TuffError.
 */
export function compileExpression(
  source: string,
): Result<Instruction[], TuffError> {
  const compiled = compileFrom(source, 0, new Map(), undefined);
  if (!compiled.ok) return compiled;
  const { value: inner } = compiled;
  return { ok: true, value: inner.code };
}

/**
 * Compiles a program of let, assignment, and expression, with the same errors as
 * interpretTuff for the constructs it covers.
 *
 * @param source - the program.
 * @returns the instructions, or a TuffError.
 */
export function compileProgram(
  source: string,
): Result<Instruction[], TuffError> {
  const code: Instruction[] = [];
  const names: Names = new Map();
  let pos = 0;
  let statement = false;
  for (;;) {
    pos = skipSpaces(source, pos);
    if (pos >= source.length) break;
    const end = readName(source, pos);
    const word = source.slice(pos, end);
    const step =
      word === "let"
        ? compileLet(source, end, code, names)
        : compileAssign(source, pos, code, names);
    if (step !== undefined) {
      if (!step.ok) return step;
      pos = step.value;
      statement = true;
      continue;
    }
    const expression = compileFrom(source, pos, names, undefined);
    if (!expression.ok) return expression;
    const { value: compiledExpr } = expression;
    code.push(...compiledExpr.code);
    pos = compiledExpr.next;
    statement = false;
  }
  if (statement) {
    code.push({ kind: InstructionKind.Push, where: source.length, value: 0 });
  } else if (code.length === 0) {
    return expectedNumber(source, pos);
  }
  return { ok: true, value: code };
}

// Compiles `let [mut] NAME = value;` from the `let` keyword at `pos`.
function compileLet(
  source: string,
  letEnd: number,
  code: Instruction[],
  names: Names,
): Result<number, TuffError> {
  let nameStart = skipSpaces(source, letEnd);
  let nameEnd = readName(source, nameStart);
  let mutable = false;
  if (source.slice(nameStart, nameEnd) === "mut") {
    mutable = true;
    nameStart = skipSpaces(source, nameEnd);
    nameEnd = readName(source, nameStart);
  }
  if (nameEnd === nameStart) {
    return expectedVariableName(source, nameStart, "let");
  }
  const name = source.slice(nameStart, nameEnd);
  if (RESERVED_NAMES.has(name)) return reservedName(nameStart, name);
  const equals = skipSpaces(source, nameEnd);
  if (source.charAt(equals) !== "=") {
    return expectedEquals(source, equals, name);
  }
  const value = compileFrom(
    source,
    skipSpaces(source, equals + 1),
    names,
    "'let' statement",
  );
  if (!value.ok) return value;
  const { value: compiledValue } = value;
  code.push(...compiledValue.code);
  code.push({
    kind: InstructionKind.Declare,
    where: nameStart,
    name,
    mutable,
  });
  names.set(name, mutable);
  return { ok: true, value: compiledValue.next + 1 };
}

// The operator of a compound assignment such as `+=`, given its first character.
function compoundOperator(ch: string): Operator | undefined {
  if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
    return toOperator(ch, 0);
  }
  return undefined;
}

// Compiles `NAME = value;` or `NAME op= value;` at `pos`, or returns undefined when the
// text is not an assignment.
function compileAssign(
  source: string,
  pos: number,
  code: Instruction[],
  names: Names,
): Result<number, TuffError> | undefined {
  const end = readName(source, pos);
  if (end === pos) return undefined;
  const name = source.slice(pos, end);
  const equals = skipSpaces(source, end);
  const operator = compoundOperator(source.charAt(equals));
  const compound = operator !== undefined && source.charAt(equals + 1) === "=";
  if (!compound && source.charAt(equals) !== "=") return undefined;
  const valueStart = skipSpaces(source, compound ? equals + 2 : equals + 1);
  const mutable = names.get(name);
  if (mutable === undefined) return undefinedName(pos, name);
  if (!mutable) return notMutable(pos, name);
  if (compound) {
    code.push({ kind: InstructionKind.Load, where: pos, name });
  }
  const value = compileFrom(source, valueStart, names, "assignment");
  if (!value.ok) return value;
  const { value: compiledValue } = value;
  code.push(...compiledValue.code);
  if (compound && operator !== undefined) {
    code.push({ kind: InstructionKind.Binary, where: pos, operator });
  }
  code.push({ kind: InstructionKind.Assign, where: pos, name });
  return { ok: true, value: compiledValue.next + 1 };
}

// Compiles an expression from `start`. With a statement noun, it stops at the ';' that
// ends the statement, and a missing ';' is reported for that noun.
function compileFrom(
  source: string,
  start: number,
  names: Names,
  noun: string | undefined,
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
    if (expectOperand) {
      const operand = readOperand(source, pos, code, stack, names);
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

// Reads an operand at `pos`: a sign, a bracket, a literal, or a name.
function readOperand(
  source: string,
  pos: number,
  code: Instruction[],
  stack: Pending[],
  names: Names,
): Advance | Failure<TuffError> {
  let sign = 1;
  let at = pos;
  const ch = source.charAt(at);
  if (ch === "+" || ch === "-") {
    if (ch === "-") sign = -1;
    at++;
    stack.push({ sign, open: false, where: at });
    if (source.charAt(at) === "+" || source.charAt(at) === "-") {
      return expectedNumber(source, at);
    }
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

/**
 * Runs compiled code with an explicit value stack.
 *
 * @param code - the instructions from compileExpression or compileProgram.
 * @param env - the variables, updated by declarations and assignments.
 * @returns the program's value, or a TuffError.
 */
export function runCode(
  code: Instruction[],
  env: Map<string, Binding>,
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
  env: Map<string, Binding>,
): Failure<TuffError> | undefined {
  const { kind, where } = instruction;
  if (kind === InstructionKind.Push) {
    values.push(instruction.value ?? 0);
    return undefined;
  }
  if (kind === InstructionKind.Load) {
    const name = instruction.name ?? "";
    const binding = env.get(name);
    if (binding === undefined) return undefinedName(where, name);
    values.push(binding.value);
    return undefined;
  }
  if (kind === InstructionKind.Sign) {
    const signed = applySign(values.pop() ?? 0, instruction.sign ?? 1, where);
    if (typeof signed === "object") return signed;
    values.push(signed);
    return undefined;
  }
  if (kind === InstructionKind.Declare) {
    const name = instruction.name ?? "";
    env.set(name, {
      value: values.pop() ?? 0,
      mutable: instruction.mutable ?? false,
    });
    return undefined;
  }
  if (kind === InstructionKind.Assign) {
    const name = instruction.name ?? "";
    const value = values.pop() ?? 0;
    const binding = env.get(name);
    if (binding === undefined) return undefinedName(where, name);
    if (typeof binding.value !== typeof value) {
      return typeMismatch(where, name, typeof binding.value, typeof value);
    }
    binding.value = value;
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
