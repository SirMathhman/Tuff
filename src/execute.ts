export enum Operation {
  Load,
  Store,
  Add,
  BitsShiftLeft,
  BitsShiftRight,
  BitsAnd,
  BitsOr,
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
  Constant,
  DirectAddress,
  IndirectAddress,
}

export interface Instruction {
  operation: Operation;
  variant: Variant;

  firstOperand: number;
  secondOperand?: number;
}

function encodeInstructionTo64Bits(instruction: Instruction): number {
  let encoded = 0;
  encoded |= (instruction.operation & 0xff) << 56;
  encoded |= (instruction.variant & 0xff) << 48;
  encoded |= instruction.firstOperand & 0xffff_ffff_ffff;

  // Handle second operand, assume first and second equal sized
  if (instruction.secondOperand !== undefined) {
    encoded |= (instruction.secondOperand & 0xffff_ffff_ffff) << 24;
  }

  return encoded;
}

function loadInstructionsIntoMemory(source: Instruction[], memory: number[]) {
  for (let i = 0; i < source.length; i++) {
    memory[i] = encodeInstructionTo64Bits(source[i]);
  }
}

export function execute(
  source: Instruction[],
  read: () => number,
  write: (output: number) => void,
): number {
  let programCounter = 0;
  let registers: number[] = new Array(8).fill(0);

  let memory: number[] = new Array(1024).fill(0);
  loadInstructionsIntoMemory(source, memory);

  while (true) {
    const encodedInstruction = memory[programCounter];
    const operation = (encodedInstruction >> 56) & 0xff;
    const variant = (encodedInstruction >> 48) & 0xff;
    const firstOperand = encodedInstruction & 0xffff_ffff_ffff;
    const secondOperand = (encodedInstruction >> 24) & 0xffff_ffff_ffff;
    switch (operation) {
      case Operation.Load:
        if (variant === Variant.Constant) {
          registers[firstOperand] = secondOperand;
        } else if (variant === Variant.DirectAddress) {
          registers[firstOperand] = memory[secondOperand];
        } else if (variant === Variant.IndirectAddress) {
          const address = memory[secondOperand];
          registers[firstOperand] = memory[address];
        }
        break;
      case Operation.Store:
        if (variant === Variant.DirectAddress) {
          memory[secondOperand] = registers[firstOperand];
        } else if (variant === Variant.IndirectAddress) {
          const address = memory[secondOperand];
          memory[address] = registers[firstOperand];
        }
        break;
      case Operation.Add:
        registers[firstOperand] += registers[secondOperand!];
        break;
      case Operation.BitsNot:
        registers[firstOperand] = -registers[firstOperand];
        break;
      case Operation.BitsShiftLeft:
        registers[firstOperand] <<= registers[secondOperand!];
        break;
      case Operation.BitsShiftRight:
        registers[firstOperand] >>= registers[secondOperand!];
        break;
      case Operation.In:
        registers[firstOperand] = read() || 0;
        break;
      case Operation.Out:
        write(registers[firstOperand]);
        break;
      case Operation.Jump:
        if (variant === Variant.Constant) {
          programCounter = secondOperand;
          continue;
        } else if (variant === Variant.DirectAddress) {
          programCounter = memory[secondOperand];
          continue;
        } else if (variant === Variant.IndirectAddress) {
          const address = memory[secondOperand];
          programCounter = memory[address];
          continue;
        }
        break;
      case Operation.JumpIfLessThanZero:
        if (registers[firstOperand] < 0) {
          if (variant === Variant.Constant) {
            programCounter = secondOperand;
            continue;
          } else if (variant === Variant.DirectAddress) {
            programCounter = memory[secondOperand];
            continue;
          } else if (variant === Variant.IndirectAddress) {
            const address = memory[secondOperand];
            programCounter = memory[address];
            continue;
          }
        }
        break;
      case Operation.Equal:
        registers[firstOperand] =
          registers[firstOperand] === registers[secondOperand!] ? 1 : 0;
        break;
      case Operation.LessThan:
        registers[firstOperand] =
          registers[firstOperand] < registers[secondOperand!] ? 1 : 0;
        break;
      case Operation.GreaterThan:
        registers[firstOperand] =
          registers[firstOperand] > registers[secondOperand!] ? 1 : 0;
        break;
      case Operation.LogicalAnd:
        registers[firstOperand] =
          registers[firstOperand] && registers[secondOperand!] ? 1 : 0;
        break;
      case Operation.LogicalOr:
        registers[firstOperand] =
          registers[firstOperand] || registers[secondOperand!] ? 1 : 0;
        break;
      case Operation.LogicalNot:
        registers[firstOperand] = !registers[firstOperand] ? 1 : 0;
        break;
      case Operation.Halt:
        return registers[0];
			case Operation.BitsAnd:
				registers[firstOperand] &=
					registers[secondOperand!];
				break;
			case Operation.BitsOr:
				registers[firstOperand] |=
					registers[secondOperand!];
				break;
			case Operation.BitsNot:
				registers[firstOperand] = ~registers[firstOperand];
				break;
			case Operation.BitsNot:
				registers[firstOperand] = -registers[firstOperand];
				break;
    }

    programCounter++;
		if (programCounter >= memory.length) {
			// We deliberately require a halt instruction.
			programCounter = 0;
		}
  }
}
