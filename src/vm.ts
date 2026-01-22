// A simple 64 bit virtual machine

// Returns the exit code
export function execute(
  instructions: Instruction[],
  read: () => number,
  write: (value: number) => void,
  maxInstructions: number = 1000,
): number {
  let programCounter = 0;
  let registers: number[] = Array(4).fill(0);

  let memory: number[] = new Array(1024).fill(0);

  // This VM requires a halt instruction. If we hit the last index of memory, we loop back around.
  // Read instructions into memory start at address 0
  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    if (inst) {
      memory[i] = encodeTo64Bits(inst);
    }
  }

  // To prevent the VM running forever, create a simple counter.
  let currentInstructionCount = 0;
  while (currentInstructionCount < maxInstructions) {
    const instructionValue = memory[programCounter];
    if (instructionValue === undefined) break;

		currentInstructionCount++;

    const decoded = decode(instructionValue);
    const { opcode, variant, operand1, operand2 } = decoded;

    // Validate operand indices
    if (operand1 >= registers.length && operand1 >= memory.length) break;

    // For each opcode, we perform the corresponding operation along with each variant
    switch (opcode) {
      case OpCode.Load:
        if (variant === Variant.Immediate) {
          registers[operand1] = operand2;
        } else if (variant === Variant.Direct) {
          const addr1 = operand2;
          if (addr1 < memory.length) {
            registers[operand1] = memory[addr1] ?? 0;
          }
        } else if (variant === Variant.Indirect) {
          const addrRef = operand2;
          if (addrRef < memory.length) {
            const address = memory[addrRef] ?? 0;
            if (address < memory.length) {
              registers[operand1] = memory[address] ?? 0;
            }
          }
        }
        break;
      case OpCode.Store:
        if (variant === Variant.Direct) {
          if (operand2 < memory.length) {
            memory[operand2] = registers[operand1] ?? 0;
          }
        } else if (variant === Variant.Indirect) {
          const addrRef = operand2;
          if (addrRef < memory.length) {
            const address = memory[addrRef] ?? 0;
            if (address < memory.length) {
              memory[address] = registers[operand1] ?? 0;
            }
          }
        }
        break;
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
      case OpCode.Halt:
        if (variant === Variant.Immediate) {
          return operand1;
        } else if (variant === Variant.Direct) {
          const exitCode = memory[operand1];
          if (exitCode !== undefined) {
            return exitCode;
          }
        } else if (variant === Variant.Indirect) {
          const addrRef = operand1;
          if (addrRef < memory.length) {
            const address = memory[addrRef];
            if (address !== undefined && address < memory.length) {
              return memory[address] ?? 0;
            }
          }
        }
        break;
      case OpCode.In:
        registers[operand1] = read();
        break;
      case OpCode.Out:
        write(registers[operand1] ?? 0);
        break;
      case OpCode.Jump:
        if (variant === Variant.Immediate) {
          programCounter = operand1;
          continue;
        } else if (variant === Variant.Direct) {
          const jumpAddr = memory[operand1];
          if (jumpAddr !== undefined) {
            programCounter = jumpAddr;
            continue;
          }
        } else if (variant === Variant.Indirect) {
          const addrRef = operand1;
          if (addrRef < memory.length) {
            const address = memory[addrRef];
            if (address !== undefined && address < memory.length) {
              programCounter = memory[address] ?? 0;
              continue;
            }
          }
        }
        break;
      case OpCode.JumpIfLessThanZero:
        if ((registers[0] ?? 0) < 0) {
          if (variant === Variant.Immediate) {
            programCounter = operand1;
            continue;
          } else if (variant === Variant.Direct) {
            const jumpAddr = memory[operand1];
            if (jumpAddr !== undefined) {
              programCounter = jumpAddr;
              continue;
            }
          } else if (variant === Variant.Indirect) {
            const addrRef = operand1;
            if (addrRef < memory.length) {
              const address = memory[addrRef];
              if (address !== undefined && address < memory.length) {
                programCounter = memory[address] ?? 0;
                continue;
              }
            }
          }
        }
        break;
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

      // No default case, this is an enum!
    }

    programCounter++;
    // wrap around to the start
    if (programCounter >= memory.length) {
      programCounter = 0;
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

export function encodeTo64Bits(instruction: Instruction): number {
  let { opcode, variant, operand1, operand2 } = instruction;
  let encoded = 0;
  encoded += (opcode & 0xff) * Math.pow(2, 32);
  encoded += (variant & 0xff) * Math.pow(2, 24);
  encoded += (operand1 & 0xfff) * Math.pow(2, 12);
  if (operand2 !== undefined) {
    encoded += operand2 & 0xfff;
  }
  return encoded;
}

export function decode(instruction: number): Required<Instruction> {
  let opcode = Math.floor(instruction / Math.pow(2, 32)) & 0xff;
  let variant = Math.floor(instruction / Math.pow(2, 24)) & 0xff;
  let operand1 = Math.floor(instruction / Math.pow(2, 12)) & 0xfff;
  let operand2 = instruction & 0xfff;
  return {
    opcode,
    variant,
    operand1,
    operand2,
  };
}
