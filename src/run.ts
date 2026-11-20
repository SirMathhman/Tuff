import type { Failure, Result, TuffError } from "./errors";
import { typeMismatch, undefinedName } from "./errors";
import { applySign, combine } from "./operations";
import type { Binding, Instruction } from "./code";
import { InstructionKind } from "./code";
import type { Value } from "./types";

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
  const frames: Frame[] = [{ code, pc: 0, scope: top }];
  for (;;) {
    const frame = frames[frames.length - 1];
    if (frame === undefined) break;
    const { code: frameCode, pc, scope } = frame;
    const instruction = frameCode[pc];
    if (instruction === undefined) {
      frames.pop();
      continue;
    }
    frame.pc++;
    if (instruction.kind === InstructionKind.Enter) {
      const inner: Scope = { vars: new Map(), parent: scope };
      frames.push({ code: instruction.block ?? [], pc: 0, scope: inner });
      continue;
    }
    const failure = step(instruction, values, scope);
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

// Runs one instruction against the value stack.
function step(
  instruction: Instruction,
  values: Value[],
  scope: Scope,
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
