import { type Instruction, OpCode, Variant } from "./vm";
import {
  parseNumberWithSuffix,
  isDereferenceOperator,
  extractDereferenceTarget,
} from "./parser";
import { buildStoreHaltInstructions } from "./types";
import { type VariableContext, resolveVariable } from "./let-binding";
import { splitByAddOperator } from "./operator-parsing";

export function tryResolveVariableAtom(
  part: string,
  context: VariableContext,
  targetRegister: number,
): Instruction[] | undefined {
  // Check for dereference first (*varName)
  if (isDereferenceOperator(part)) {
    const varName = extractDereferenceTarget(part);
    const varAddress = resolveVariable(context, varName);
    if (varAddress === undefined) return undefined;

    // Use different temp addresses for different registers
    const tempAddress = targetRegister === 1 ? 900 : 902;

    return [
      {
        opcode: OpCode.Load,
        variant: Variant.Direct,
        operand1: 0,
        operand2: varAddress,
      },
      {
        opcode: OpCode.Load,
        variant: Variant.Indirect,
        operand1: 0,
        operand2: 0,
      },
      {
        opcode: OpCode.Store,
        variant: Variant.Direct,
        operand1: 0,
        operand2: tempAddress,
      },
      {
        opcode: OpCode.Load,
        variant: Variant.Direct,
        operand1: targetRegister,
        operand2: tempAddress,
      },
    ];
  }

  // Regular variable resolution
  const varAddress = resolveVariable(context, part);
  if (varAddress === undefined) return undefined;

  return [
    {
      opcode: OpCode.Load,
      variant: Variant.Direct,
      operand1: targetRegister,
      operand2: varAddress,
    },
  ];
}

export function parseAddExpressionWithContext(
  source: string,
  context: VariableContext,
): Instruction[] | undefined {
  const parts = splitByAddOperator(source);
  if (!parts) return undefined;

  const { leftPart, rightPart } = parts;

  // Try to resolve left as a variable
  const leftVarInstructions = tryResolveVariableAtom(leftPart, context, 1);
  if (leftVarInstructions) {
    // Left is a variable, try to resolve right as variable or number
    const rightVarInstructions = tryResolveVariableAtom(rightPart, context, 0);
    if (rightVarInstructions) {
      return [
        ...leftVarInstructions,
        ...rightVarInstructions,
        ...buildStoreHaltInstructions(OpCode.Add),
      ];
    }

    const rightNum = parseNumberWithSuffix(rightPart);
    if (rightNum !== undefined) {
      return [
        ...leftVarInstructions,
        {
          opcode: OpCode.Load,
          variant: Variant.Immediate,
          operand1: 0,
          operand2: rightNum,
        },
        ...buildStoreHaltInstructions(OpCode.Add),
      ];
    }
  }

  return undefined;
}
