import type { Failure, Result, TuffError } from "./errors";
import {
  nonBooleanCondition,
  tooMuchWork,
  typeMismatch,
  undefinedName,
} from "./errors";
import { applySign, combine } from "./operations";
import type { Binding, Instruction } from "./instructions";
import { InstructionKind } from "./instructions";
import type { Value } from "./types";

// The most instructions one run may execute, so a runaway loop stops with an error.
const MAX_STEPS = 200000;

/**
 * A scope at run time: its variables, and the scope it is nested in.
 */
export interface Scope {
  /** The variables declared in this scope. */
  vars: Map<string, Binding>;
  /** The enclosing scope, or undefined at the top. */
  parent: Scope | undefined;
}

/**
 * A block being run: its instructions, the next one, and its scope.
 */
export interface Frame {
  /** The instructions of the block. */
  code: Instruction[];
  /** The index of the next instruction. */
  pc: number;
  /** The scope the block's variables live in. */
  scope: Scope;
  /** Whether the block runs without effects: its writes are checked but not stored. */
  lenient: boolean;
}

/**
 * Runs compiled code with an explicit value stack and an explicit stack of blocks.
 *
 * @param code - the instructions from compileExpression or compileProgram.
 * @param env - the top-level variables, updated by declarations and assignments.
 * @returns the program's value, or a TuffError.
 */
export function runCode(
  code: Instruction[],
  env: Map<string, Binding>,
): Result<number, TuffError> {
  const values: Value[] = [];
  const top: Scope = { vars: env, parent: undefined };
  const frames: Frame[] = [{ code, pc: 0, scope: top, lenient: false }];
  let steps = 0;
  for (;;) {
    const frame = frames[frames.length - 1];
    if (frame === undefined) break;
    const { code: frameCode, pc, scope, lenient } = frame;
    const instruction = frameCode[pc];
    if (instruction === undefined) {
      frames.pop();
      continue;
    }
    frame.pc++;
    steps++;
    if (steps > MAX_STEPS) return tooMuchWork(instruction.where);
    if (instruction.kind === InstructionKind.Enter) {
      const inner: Scope = { vars: new Map(), parent: scope };
      frames.push({
        code: instruction.block ?? [],
        pc: 0,
        scope: inner,
        lenient,
      });
      continue;
    }
    if (instruction.kind === InstructionKind.Branch) {
      const failure = pushBranches(instruction, values, frames, frame);
      if (failure !== undefined) return failure;
      continue;
    }
    const failure = step(instruction, values, scope, lenient);
    if (failure !== undefined) return failure;
  }
  const result = values.pop() ?? 0;
  return {
    ok: true,
    value: typeof result === "boolean" ? Number(result) : result,
  };
}

// The binding of a name, searching the innermost scope first.
function lookup(scope: Scope, name: string): Binding | undefined {
  let current: Scope | undefined = scope;
  while (current !== undefined) {
    const { vars } = current;
    const found = vars.get(name);
    if (found !== undefined) return found;
    current = current.parent;
  }
  return undefined;
}

// Pushes the two branches of an if, the then-branch on top so it runs first. The branch
// that is not chosen runs without effects, so its errors are still reported.
function pushBranches(
  instruction: Instruction,
  values: Value[],
  frames: Frame[],
  frame: Frame,
): Failure<TuffError> | undefined {
  const condition = values[values.length - 1];
  if (typeof condition !== "boolean") {
    return nonBooleanCondition(instruction.where, "if");
  }
  const { scope, lenient } = frame;
  frames.push({
    code: instruction.otherwise ?? [],
    pc: 0,
    scope: { vars: new Map(), parent: scope },
    lenient: lenient || condition,
  });
  frames.push({
    code: instruction.block ?? [],
    pc: 0,
    scope: { vars: new Map(), parent: scope },
    lenient: lenient || !condition,
  });
  return undefined;
}

// Runs one instruction against the value stack. In a lenient block a write is checked
// but not stored.
function step(
  instruction: Instruction,
  values: Value[],
  scope: Scope,
  lenient: boolean,
): Failure<TuffError> | undefined {
  const { kind, where } = instruction;
  if (kind === InstructionKind.Push) {
    values.push(instruction.value ?? 0);
    return undefined;
  }
  if (kind === InstructionKind.Load) {
    const name = instruction.name ?? "";
    const binding = lookup(scope, name);
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
    const { vars } = scope;
    vars.set(name, {
      value: values.pop() ?? 0,
      mutable: instruction.mutable ?? false,
    });
    return undefined;
  }
  if (kind === InstructionKind.Assign) {
    const name = instruction.name ?? "";
    const value = values.pop() ?? 0;
    const binding = lookup(scope, name);
    if (binding === undefined) return undefinedName(where, name);
    if (typeof binding.value !== typeof value) {
      return typeMismatch(where, name, typeof binding.value, typeof value);
    }
    if (!lenient) binding.value = value;
    return undefined;
  }
  if (kind === InstructionKind.Pick) {
    const otherwise = values.pop() ?? 0;
    const taken = values.pop() ?? 0;
    const condition = values.pop() ?? false;
    values.push(condition ? taken : otherwise);
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
