import { type Instruction } from "./vm";

export interface ExecutionState {
  registers: number[];
  memory: number[];
  programCounter: number;
  shouldContinue: boolean;
  exitCode?: number;

  prettyPrint(): string;
}

export interface Cycle {
  beforeInstructionExecuted: ExecutionState;
  instructionToExecute: Instruction;
}

export interface Dump {
  cycles: Cycle[];
}
