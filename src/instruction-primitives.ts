import { type Instruction, OpCode, Variant } from "./vm";

// Shared instruction patterns to eliminate code duplication
// All complex instruction sequences are built from these primitives

export function buildLoadDirect(
  register: number,
  fromAddr: number,
): Instruction {
  return {
    opcode: OpCode.Load,
    variant: Variant.Direct,
    operand1: register,
    operand2: fromAddr,
  };
}

export function buildLoadImmediate(
  register: number,
  value: number,
): Instruction {
  return {
    opcode: OpCode.Load,
    variant: Variant.Immediate,
    operand1: register,
    operand2: value,
  };
}

export function buildStoreDirect(
  register: number,
  toAddr: number,
): Instruction {
  return {
    opcode: OpCode.Store,
    variant: Variant.Direct,
    operand1: register,
    operand2: toAddr,
  };
}

export function buildAddImmediate(register: number): Instruction {
  return {
    opcode: OpCode.Add,
    variant: Variant.Immediate,
    operand1: register,
    operand2: 0,
  };
}

export function buildHaltDirect(addr: number): Instruction {
  return {
    opcode: OpCode.Halt,
    variant: Variant.Direct,
    operand1: addr,
  };
}

export function buildIn(register: number): Instruction {
  return {
    opcode: OpCode.In,
    variant: Variant.Immediate,
    operand1: register,
  };
}

// Common sequences built from primitives
export function buildStoreAndHalt(): Instruction[] {
  return [buildStoreDirect(1, 900), buildHaltDirect(900)];
}

export function buildLoadAddAndHalt(fromAddr: number): Instruction[] {
  return [
    buildLoadDirect(1, fromAddr),
    buildAddImmediate(1),
    buildStoreDirect(1, 900),
    buildHaltDirect(900),
  ];
}
