import { type Instruction, OpCode, Variant } from "../core/vm";
import {
  buildLoadDirect,
  buildLoadImmediate,
  buildStoreDirect,
} from "../compilation/instruction-primitives";

/**
 * Memory layout for arrays:
 * Array variables are allocated starting at 904 (same as scalar variables)
 * Each array occupies totalLength slots
 * array[0] is at baseAddress
 * array[i] is at baseAddress + i
 */

export function buildArrayStoreInstructions(
  elementInstructions: Instruction[],
  elementIndex: number,
  arrayBaseAddress: number,
): Instruction[] {
  // Take result from memory[900], store to array[elementIndex]
  const targetAddress = arrayBaseAddress + elementIndex;

  return [
    ...elementInstructions.slice(0, -1), // Remove halt
    buildLoadDirect(1, 900), // Load element value
    buildStoreDirect(1, targetAddress), // Store to array[elementIndex]
  ];
}

export function buildArrayLoadInstruction(
  arrayBaseAddress: number,
  indexRegister: number,
  targetRegister: number,
): Instruction[] {
  return [
    buildLoadDirect(indexRegister, 903), // Load index to temp
    {
      opcode: OpCode.Add,
      variant: Variant.Immediate,
      operand1: indexRegister,
      operand2: arrayBaseAddress,
    },
    buildStoreDirect(indexRegister, 902), // Store computed address
    {
      opcode: OpCode.Load,
      variant: Variant.Indirect,
      operand1: targetRegister,
      operand2: 902,
    },
  ];
}

export function buildArrayIndexAccess(arrayBaseAddress: number): Instruction[] {
  // Load from array[r0] where r0 contains index
  // Result goes to memory[900]
  return [
    buildLoadDirect(0, 903), // Load index
    buildLoadImmediate(1, arrayBaseAddress), // Load base address
    {
      opcode: OpCode.Add,
      variant: Variant.Immediate,
      operand1: 0,
      operand2: 1,
    },
    buildStoreDirect(0, 902), // Store computed address
    {
      opcode: OpCode.Load,
      variant: Variant.Indirect,
      operand1: 0,
      operand2: 902,
    },
    buildStoreDirect(0, 900),
  ];
}
