import type { Operator } from "./scanner";
import type { Value } from "./types";

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
  /** The body of a block, when the kind is enter, or the then-body when the kind is branch. */
  block?: Instruction[];
  /** The else-body, when the kind is branch. */
  otherwise?: Instruction[];
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
  /** Run a block in a new scope; its final value stays on the value stack. */
  Enter = "enter",
  /** Run both branches of an if, the one not chosen without effects; the condition stays on the stack. */
  Branch = "branch",
  /** Pop both branch values and the condition, and push the chosen value. */
  Pick = "pick",
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

/**
 * A piece of code still to compile: the program, or the body of a block.
 */
export interface Unit {
  /** The instructions being filled in. */
  code: Instruction[];
  /** The offset where the unit's text starts. */
  pos: number;
  /** The variables visible at the start of the unit. */
  names: Names;
  /** What the unit holds: a program, a block, or an if condition. */
  kind: UnitKind;
}

/**
 * The kinds of unit the compiler queues.
 */
export enum UnitKind {
  /** The whole program. */
  Program = "program",
  /** The body of a block, which ends at its closing brace. */
  Block = "block",
  /** The condition of an if, which ends at its closing parenthesis. */
  Condition = "condition",
  /** A single-operand branch of an if. */
  Factor = "factor",
}

/**
 * Where reading an operand stopped, and whether the operand is complete.
 */
export interface Advance {
  /** The offset after what was read. */
  next: number;
  /** Whether a complete operand was read, so an operator must come next. */
  done: boolean;
}

/**
 * A compiled expression, and the offset after it.
 */
export interface Compiled {
  /** The instructions. */
  code: Instruction[];
  /** The offset after the compiled text. */
  next: number;
}
