// A simple 64 bit virtual machine

interface ExecutionState {
  registers: number[];
  memory: number[];
  programCounter: number;
  shouldContinue: boolean;
  exitCode?: number;

  prettyPrint(): string;
}

function resolveIndirectAddress(
  addrRef: number,
  memory: number[],
): number | undefined {
  if (addrRef >= memory.length) return undefined;
  const address = memory[addrRef];
  if (address === undefined || address >= memory.length) return undefined;
  return address;
}

function transferValue(
  registers: number[],
  memory: number[],
  regIndex: number,
  memIndex: number,
  isStore: boolean,
): void {
  const [source, dest, sourceIndex, destIndex] = isStore
    ? [registers, memory, regIndex, memIndex]
    : [memory, registers, memIndex, regIndex];
  dest[destIndex] = source[sourceIndex] ?? 0;
}

function handleIndirectMemoryOp(
  operand1: number,
  operand2: number,
  registers: number[],
  memory: number[],
  isStore: boolean,
): void {
  const address = resolveIndirectAddress(operand2, memory);
  if (address !== undefined) {
    transferValue(registers, memory, operand1, address, isStore);
  }
}

function readVariant(
  variant: number,
  operand1: number,
  memory: number[],
): number | undefined {
  if (variant === Variant.Immediate) {
    return operand1;
  }
  if (variant === Variant.Direct) {
    const value = memory[operand1];
    if (value !== undefined) {
      return value;
    }
    return undefined;
  }
  if (variant === Variant.Indirect) {
    const address = resolveIndirectAddress(operand1, memory);
    if (address !== undefined) {
      return memory[address] ?? 0;
    }
    return undefined;
  }
}

function handleMemoryOp(
  variant: number,
  operand1: number,
  operand2: number,
  registers: number[],
  memory: number[],
  isStore: boolean,
): void {
  if (!isStore && variant === Variant.Immediate) {
    registers[operand1] = operand2;
    return;
  }
  if (variant === Variant.Direct && operand2 < memory.length) {
    transferValue(registers, memory, operand1, operand2, isStore);
    return;
  }
  if (variant === Variant.Indirect) {
    handleIndirectMemoryOp(operand1, operand2, registers, memory, isStore);
  }
}

function handleHalt(
  variant: number,
  operand1: number,
  registers: number[],
  memory: number[],
): number | undefined {
  return readVariant(variant, operand1, memory);
}

function handleJump(
  variant: number,
  operand1: number,
  registers: number[],
  memory: number[],
): number | undefined {
  return readVariant(variant, operand1, memory);
}

function handleArithmetic(
  opcode: OpCode,
  operand1: number,
  operand2: number,
  registers: number[],
): void {
  switch (opcode) {
    case OpCode.Add:
      registers[operand1] =
        (registers[operand1] ?? 0) + (registers[operand2] ?? 0);
      break;
    case OpCode.Sub:
      registers[operand1] =
        (registers[operand1] ?? 0) - (registers[operand2] ?? 0);
      break;
    case OpCode.Mul:
      registers[operand1] =
        (registers[operand1] ?? 0) * (registers[operand2] ?? 0);
      break;
    case OpCode.Div:
      registers[operand1] =
        (registers[operand1] ?? 0) / (registers[operand2] ?? 1);
      break;
  }
}

function handleComparison(
  opcode: OpCode,
  operand1: number,
  operand2: number,
  registers: number[],
): void {
  switch (opcode) {
    case OpCode.Equal:
      registers[operand1] =
        (registers[operand1] ?? 0) === (registers[operand2] ?? 0) ? 1 : 0;
      break;
    case OpCode.LessThan:
      registers[operand1] =
        (registers[operand1] ?? 0) < (registers[operand2] ?? 0) ? 1 : 0;
      break;
    case OpCode.GreaterThan:
      registers[operand1] =
        (registers[operand1] ?? 0) > (registers[operand2] ?? 0) ? 1 : 0;
      break;
    case OpCode.LessThanOrEqual:
      registers[operand1] =
        (registers[operand1] ?? 0) <= (registers[operand2] ?? 0) ? 1 : 0;
      break;
    case OpCode.GreaterThanOrEqual:
      registers[operand1] =
        (registers[operand1] ?? 0) >= (registers[operand2] ?? 0) ? 1 : 0;
      break;
  }
}

function handleLogical(
  opcode: OpCode,
  operand1: number,
  operand2: number,
  registers: number[],
): void {
  switch (opcode) {
    case OpCode.LogicalAnd:
      registers[operand1] =
        (registers[operand1] ?? 0) && (registers[operand2] ?? 0) ? 1 : 0;
      break;
    case OpCode.LogicalOr:
      registers[operand1] =
        (registers[operand1] ?? 0) || (registers[operand2] ?? 0) ? 1 : 0;
      break;
    case OpCode.LogicalNot:
      registers[operand1] = !(registers[operand1] ?? 0) ? 1 : 0;
      break;
  }
}

function handleBitwise(
  opcode: OpCode,
  operand1: number,
  operand2: number,
  registers: number[],
): void {
  switch (opcode) {
    case OpCode.BitsShiftLeft:
      registers[operand1] =
        (registers[operand1] ?? 0) << (registers[operand2] ?? 0);
      break;
    case OpCode.BitsShiftRight:
      registers[operand1] =
        (registers[operand1] ?? 0) >> (registers[operand2] ?? 0);
      break;
    case OpCode.BitsAnd:
      registers[operand1] =
        (registers[operand1] ?? 0) & (registers[operand2] ?? 0);
      break;
    case OpCode.BitsOr:
      registers[operand1] =
        (registers[operand1] ?? 0) | (registers[operand2] ?? 0);
      break;
    case OpCode.BitsXor:
      registers[operand1] =
        (registers[operand1] ?? 0) ^ (registers[operand2] ?? 0);
      break;
    case OpCode.BitsNot:
      registers[operand1] = ~(registers[operand1] ?? 0);
      break;
  }
}

function handleJumpIfLessThanZero(
  variant: number,
  operand1: number,
  registers: number[],
  memory: number[],
): number | undefined {
  if ((registers[0] ?? 0) >= 0) return undefined;
  return handleJump(variant, operand1, registers, memory);
}

function createJumpResult(
  state: ExecutionState,
  jumpAddr: number | undefined,
): { state: ExecutionState; isJump: boolean } {
  if (jumpAddr !== undefined) {
    return {
      state: { ...state, programCounter: jumpAddr, shouldContinue: true },
      isJump: true,
    };
  }
  return { state, isJump: false };
}

// eslint-disable-next-line max-lines-per-function
function dispatchInstruction(
  opcode: OpCode,
  variant: number,
  operand1: number,
  operand2: number,
  state: ExecutionState,
  read: () => number,
  write: (value: number) => void,
): { state: ExecutionState; isJump: boolean } {
  const { registers, memory } = state;

  switch (opcode) {
    case OpCode.Load:
      handleMemoryOp(variant, operand1, operand2, registers, memory, false);
      return { state, isJump: false };
    case OpCode.Store:
      handleMemoryOp(variant, operand1, operand2, registers, memory, true);
      return { state, isJump: false };
    case OpCode.Add:
    case OpCode.Sub:
    case OpCode.Mul:
    case OpCode.Div:
      handleArithmetic(opcode, operand1, operand2, registers);
      return { state, isJump: false };
    case OpCode.Halt: {
      const exitCode = handleHalt(variant, operand1, registers, memory);
      if (exitCode !== undefined) {
        return {
          state: { ...state, shouldContinue: false, exitCode },
          isJump: true,
        };
      }
      return { state, isJump: false };
    }
    case OpCode.In:
      registers[operand1] = read();
      return { state, isJump: false };
    case OpCode.Out:
      write(registers[operand1] ?? 0);
      return { state, isJump: false };
    case OpCode.Jump: {
      const jumpAddr = handleJump(variant, operand1, registers, memory);
      return createJumpResult(state, jumpAddr);
    }
    case OpCode.JumpIfLessThanZero: {
      const jumpAddr = handleJumpIfLessThanZero(
        variant,
        operand1,
        registers,
        memory,
      );
      return createJumpResult(state, jumpAddr);
    }
    case OpCode.Equal:
    case OpCode.LessThan:
    case OpCode.GreaterThan:
    case OpCode.LessThanOrEqual:
    case OpCode.GreaterThanOrEqual:
      handleComparison(opcode, operand1, operand2, registers);
      return { state, isJump: false };
    case OpCode.LogicalAnd:
    case OpCode.LogicalOr:
    case OpCode.LogicalNot:
      handleLogical(opcode, operand1, operand2, registers);
      return { state, isJump: false };
    case OpCode.BitsShiftLeft:
    case OpCode.BitsShiftRight:
    case OpCode.BitsAnd:
    case OpCode.BitsOr:
    case OpCode.BitsXor:
    case OpCode.BitsNot:
      handleBitwise(opcode, operand1, operand2, registers);
      return { state, isJump: false };
  }
}

function executeInstruction(
  decoded: Required<Instruction>,
  state: ExecutionState,
  read: () => number,
  write: (value: number) => void,
): ExecutionState {
  const { opcode, variant, operand1, operand2 } = decoded;
  const result = dispatchInstruction(
    opcode,
    variant,
    operand1,
    operand2,
    state,
    read,
    write,
  );
  return result.state;
}

function incrementProgramCounter(
  state: ExecutionState,
  memory: number[],
): void {
  state.programCounter++;
  if (state.programCounter >= memory.length) {
    state.programCounter = 0;
  }
}

// Returns the exit code
export function execute(
  instructions: Instruction[],
  read: () => number,
  write: (value: number) => void,
  dumper: (state: ExecutionState, instruction: Instruction) => void = () => {},
  maxInstructions: number = 1000,
): number {
  const memory: number[] = new Array(1024).fill(0);
  const registers: number[] = Array(4).fill(0);

  // Read instructions into memory
  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    if (inst) {
      memory[i] = encodeTo64Bits(inst);
    }
  }

  let state: ExecutionState = {
    registers,
    memory,
    programCounter: 0,
    shouldContinue: true,
    prettyPrint(): string {
      return `PC: ${this.programCounter}, Registers: [${this.registers.join(", ")}], Memory[900]: ${this.memory[900]}`;
    },
  };

  let currentInstructionCount = 0;
  while (currentInstructionCount < maxInstructions && state.shouldContinue) {
    const instructionValue = memory[state.programCounter];
    if (instructionValue === undefined) break;
    currentInstructionCount++;

    const decoded = decode(instructionValue);
    dumper(state, decoded);

    const { operand1 } = decoded;

    // Validate operand indices
    if (operand1 >= registers.length && operand1 >= memory.length) break;

    const previousPC = state.programCounter;
    state = executeInstruction(decoded, state, read, write);

    if (state.exitCode !== undefined) {
      return state.exitCode;
    }

    // Only increment if instruction didn't change PC (e.g., jump)
    if (state.programCounter === previousPC) {
      incrementProgramCounter(state, memory);
    }
  }

  // Somehow we get here without a halt, return 0
  return 0;
}

export enum OpCode {
  Load,
  Store,
  Add,
  Sub,
  Mul,
  Div,
  BitsShiftLeft,
  BitsShiftRight,
  BitsAnd,
  BitsOr,
  BitsXor,
  BitsNot,
  In,
  Out,
  Jump,
  JumpIfLessThanZero,
  Equal,
  LessThan,
  GreaterThan,
  LessThanOrEqual,
  GreaterThanOrEqual,
  LogicalAnd,
  LogicalOr,
  LogicalNot,
  Halt,
}

export enum Variant {
  // This is a constant, like loading 5 into a register.
  Immediate,

  // This is a direct address in memory, so passing in 5 would represent address 5.
  Direct,

  // This is an indirect address, so passing in 5 would represent the address stored at address 5.
  Indirect,
}

export interface Instruction {
  // We only support up to two operands for simplicity
  // But we require at least one
  opcode: OpCode;
  variant: Variant;
  operand1: number;
  operand2?: number;
}

function encodeBitField(value: number, mask: number, shift: number): number {
  return (value & mask) * Math.pow(2, shift);
}

export function encodeTo64Bits(instruction: Instruction): number {
  const { opcode, variant, operand1, operand2 } = instruction;
  let encoded = 0;
  encoded += encodeBitField(opcode, 0xff, 32);
  encoded += encodeBitField(variant, 0xff, 24);
  encoded += encodeBitField(operand1, 0xfff, 12);
  if (operand2 !== undefined) {
    encoded += operand2 & 0xfff;
  }
  return encoded;
}

function decodeBitField(value: number, shift: number, mask: number): number {
  return Math.floor(value / Math.pow(2, shift)) & mask;
}

function signExtend12Bit(value: number): number {
  if (value & 0x800) {
    return value | 0xfffff000;
  }
  return value;
}

export function decode(instruction: number): Required<Instruction> {
  const opcode = decodeBitField(instruction, 32, 0xff);
  const variant = decodeBitField(instruction, 24, 0xff);
  const operand1 = decodeBitField(instruction, 12, 0xfff);
  const operand2 = instruction & 0xfff;

  let extendedOperand1 = operand1;
  let extendedOperand2 = operand2;

  if (variant === Variant.Immediate) {
    if (opcode === OpCode.Halt || opcode === OpCode.Load) {
      extendedOperand1 = signExtend12Bit(operand1);
    }
    if (opcode === OpCode.Load) {
      extendedOperand2 = signExtend12Bit(operand2);
    }
  }

  return {
    opcode,
    variant,
    operand1: extendedOperand1,
    operand2: extendedOperand2,
  };
}
