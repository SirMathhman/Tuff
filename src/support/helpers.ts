import { type Instruction, OpCode } from "../core/vm";
import {
  buildLoadDirect,
  buildLoadImmediate,
  buildStoreDirect,
  buildAddImmediate,
  buildHaltDirect,
  buildIn,
  buildLoadAddAndHalt,
  buildComparisonImmediate,
} from "../compilation/instruction-primitives";

export function buildAddInstructions(): Instruction[] {
  return buildLoadAddAndHalt(901);
}

export function buildReadAddConstantInstructions(
  constant: number,
): Instruction[] {
  return [
    buildIn(0),
    buildStoreDirect(0, 901),
    buildLoadImmediate(0, constant),
    ...buildLoadAddAndHalt(901),
  ];
}

export function buildConstantAddReadInstructions(
  constant: number,
): Instruction[] {
  return [
    buildLoadImmediate(0, constant),
    buildStoreDirect(0, 901),
    buildIn(0),
    ...buildLoadAddAndHalt(901),
  ];
}

export function buildChainedReadAddExpression(
  chainedAddition: Instruction[],
): Instruction[] {
  return [
    buildIn(0),
    buildStoreDirect(0, 902),
    ...chainedAddition.slice(0, -1),
    buildLoadDirect(0, 900),
    buildLoadDirect(1, 902),
    buildAddImmediate(1),
    buildStoreDirect(1, 900),
    buildHaltDirect(900),
  ];
}

export function buildReadAddMulInstructions(): Instruction[] {
  return [buildLoadDirect(0, 902), ...buildLoadAddAndHalt(901)];
}

export function buildNumberLiteral(num: number): Instruction[] {
  return [
    buildLoadImmediate(0, num),
    buildStoreDirect(0, 900),
    buildHaltDirect(900),
  ];
}

export function buildBooleanLiteral(value: boolean): Instruction[] {
  return buildNumberLiteral(value ? 1 : 0);
}

export function buildReadComparisonRead(opcode: OpCode): Instruction[] {
  return [
    buildIn(0),
    buildStoreDirect(0, 901),
    buildIn(0),
    buildLoadDirect(1, 901),
    buildComparisonImmediate(1, opcode),
    buildStoreDirect(1, 900),
    buildHaltDirect(900),
  ];
}

export function buildReadComparisonConstant(
  constant: number,
  opcode: OpCode,
): Instruction[] {
  return [
    buildIn(0),
    buildLoadImmediate(1, constant),
    buildComparisonImmediate(0, opcode),
    buildStoreDirect(0, 900),
    buildHaltDirect(900),
  ];
}

/**
 * Splits a string by commas while respecting nested brackets and parentheses.
 * Used for parsing array literals and function arguments.
 *
 * @param input - String to split (without outer delimiters)
 * @returns Array of trimmed string parts separated by commas
 */
export function splitByCommaRespectingNesting(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (char === "[" || char === "(") {
      depth++;
      current += char;
    } else if (char === "]" || char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts;
}
