import { type Instruction, OpCode, Variant } from "./vm";

function parseNumberWithSuffix(source: string): number | undefined {
  const suffixIndex = findTypeSuffixIndex(source);
  const numStr = suffixIndex >= 0 ? source.substring(0, suffixIndex) : source;

  // Validate the number part contains only digits and optional minus sign
  let isValidNumber = numStr.length > 0;
  for (let i = 0; i < numStr.length; i++) {
    const char = numStr[i];
    if (i === 0 && char === "-") continue;
    if (char && char >= "0" && char <= "9") continue;
    isValidNumber = false;
    break;
  }

  if (isValidNumber) {
    const num = parseInt(numStr, 10);
    if (!isNaN(num)) {
      return num;
    }
  }
}

function findTypeSuffixIndex(source: string): number {
  for (let i = source.length - 1; i >= 0; i--) {
    const char = source[i];
    if (char && char >= "0" && char <= "9") continue;
    if (char && char >= "A" && char <= "Z") {
      return i;
    }
    break;
  }
  return -1;
}

export function parseReadInstruction(
  source: string,
): Instruction[] | undefined {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char !== " " && char !== "\t") {
      current += char;
      continue;
    }
    if (current.length > 0) {
      parts.push(current);
      current = "";
    }
  }
  if (current.length > 0) {
    parts.push(current);
  }

  if (parts.length !== 2 || parts[0] !== "read") {
    return undefined;
  }

  // Read from stdin into register 0, store in memory at 901, then halt
  return [
    {
      opcode: OpCode.In,
      variant: Variant.Immediate,
      operand1: 0,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 0,
      operand2: 901,
    },
    {
      opcode: OpCode.Halt,
      variant: Variant.Direct,
      operand1: 901,
    },
  ];
}

function parseReadIntoRegister0(): Instruction[] {
  return [
    {
      opcode: OpCode.In,
      variant: Variant.Immediate,
      operand1: 0,
    },
  ];
}

function parseReadIntoRegister1(): Instruction[] {
  // Read into r0, then store to temp location, then load into r1
  return [
    {
      opcode: OpCode.In,
      variant: Variant.Immediate,
      operand1: 0,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 0,
      operand2: 903,
    },
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 903,
    },
  ];
}

export function parseSimpleAtom(source: string): Instruction[] | undefined {
  if (source.startsWith("read")) {
    // For multiplication left side, read into r1 so right side can use r0
    return parseReadIntoRegister1();
  }

  const num = parseNumberWithSuffix(source);
  if (num !== undefined) {
    return [
      {
        opcode: OpCode.Load,
        variant: Variant.Immediate,
        operand1: 1,
        operand2: num,
      },
    ];
  }

  return undefined;
}

export function parseRightAtom(source: string): Instruction[] | undefined {
  if (source.startsWith("read")) {
    return parseReadIntoRegister0();
  }

  const num = parseNumberWithSuffix(source);
  if (num !== undefined) {
    return [
      {
        opcode: OpCode.Load,
        variant: Variant.Immediate,
        operand1: 0,
        operand2: num,
      },
    ];
  }

  return undefined;
}

export function parseMulExpression(source: string): Instruction[] | undefined {
  // Look for * operator
  let mulIndex = -1;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "*") {
      mulIndex = i;
      break;
    }
  }
  if (mulIndex === -1) return undefined;

  const leftPart = source.substring(0, mulIndex).trim();
  const rightPart = source.substring(mulIndex + 1).trim();

  const leftInstructions = parseSimpleAtom(leftPart);
  if (!leftInstructions) return undefined;

  // Parse right side - could be read, number, or another multiplication
  let rightInstructions: Instruction[] | undefined;
  const rightMul = parseMulExpression(rightPart);
  if (rightMul) {
    rightInstructions = rightMul;
  } else {
    rightInstructions = parseRightAtom(rightPart);
  }

  if (!rightInstructions) return undefined;

  // Build complete multiplication instruction sequence
  // Store result in memory[902] to avoid collision with addition operands
  return [
    ...leftInstructions,
    ...rightInstructions,
    {
      opcode: OpCode.Mul,
      variant: Variant.Immediate,
      operand1: 1,
      operand2: 0,
    },
    {
      opcode: OpCode.Store,
      variant: Variant.Direct,
      operand1: 1,
      operand2: 902,
    },
  ];
}

export { parseNumberWithSuffix };
