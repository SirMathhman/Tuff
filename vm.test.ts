import { describe, it, expect } from "bun:test";
import {
  encodeTo64Bits,
  decode,
  OpCode,
  Variant,
  type Instruction,
} from "./vm";

describe("encodeTo64Bits and decode", () => {
  it("should encode and decode an instruction with operand1 and operand2", () => {
    const instruction: Instruction = {
      opcode: OpCode.Load,
      variant: Variant.Immediate,
      operand1: 0,
      operand2: 255,
    };

    const encoded = encodeTo64Bits(instruction);
    const decoded = decode(encoded);

    expect(decoded.opcode).toBe(OpCode.Load);
    expect(decoded.variant).toBe(Variant.Immediate);
    expect(decoded.operand1).toBe(0);
    expect(decoded.operand2).toBe(255);
  });

  it("should encode and decode an instruction with two operands", () => {
    const instruction: Instruction = {
      opcode: OpCode.Add,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 2,
    };

    const encoded = encodeTo64Bits(instruction);
    const decoded = decode(encoded);

    expect(decoded.opcode).toBe(OpCode.Add);
    expect(decoded.variant).toBe(Variant.Direct);
    expect(decoded.operand1).toBe(1);
    expect(decoded.operand2).toBe(2);
  });

  it("should handle maximum 12-bit values", () => {
    const instruction: Instruction = {
      opcode: OpCode.Halt,
      variant: Variant.Indirect,
      operand1: 0xfff, // max for 12 bits
      operand2: 0xfff,
    };

    const encoded = encodeTo64Bits(instruction);
    const decoded = decode(encoded);

    expect(decoded.opcode).toBe(OpCode.Halt);
    expect(decoded.variant).toBe(Variant.Indirect);
    expect(decoded.operand1).toBe(0xfff);
    expect(decoded.operand2).toBe(0xfff);
  });

  it("should preserve all opcodes", () => {
    for (let opcode = 0; opcode <= OpCode.Halt; opcode++) {
      const instruction: Instruction = {
        opcode,
        variant: Variant.Immediate,
        operand1: 5,
        operand2: 10,
      };

      const encoded = encodeTo64Bits(instruction);
      const decoded = decode(encoded);

      expect(decoded.opcode).toBe(opcode);
    }
  });

  it("should preserve all variants", () => {
    for (let variant = 0; variant <= Variant.Indirect; variant++) {
      const instruction: Instruction = {
        opcode: OpCode.Load,
        variant,
        operand1: 3,
        operand2: 7,
      };

      const encoded = encodeTo64Bits(instruction);
      const decoded = decode(encoded);

      expect(decoded.variant).toBe(variant);
    }
  });
});
